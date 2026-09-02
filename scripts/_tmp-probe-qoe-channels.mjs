#!/usr/bin/env node
/**
 * Deep probe for QoE review: upstream + panel splice byte-gap analysis.
 * Usage: node scripts/_tmp-probe-qoe-channels.mjs
 */
import { PrismaClient } from "@prisma/client";
import http from "node:http";
import https from "node:https";

const NAMES = [
  "Sky Sports Main Event FHD",
  "Sky Sports Golf FHD 5.1",
  "BBC One HD",
  "ITV 1 FHD",
  "Sky Sports Premier League HEVC",
];

const SAMPLE_SEC = 50;
const PLAYER_STALL_IDLE_MS = 2500;
const STALL_GAP_MS = 45_000;
const MIN_HEALTHY_PULSE_BYTES = 64_000;
const PULSE_MS = 15_000;

const p = new PrismaClient();

function streamNumericId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function policy(stream) {
  const mode = stream.vodMode;
  if (stream.isOnDemand || mode === "ON_DEMAND") return "on_demand";
  if (mode === "LIVE") return "live_splice";
  return mode || "unknown";
}

function pulseLooksLikeStall(gapMs, byteLen, idleMs = 0) {
  if (idleMs >= PLAYER_STALL_IDLE_MS) return true;
  if (gapMs < STALL_GAP_MS) return false;
  return byteLen < MIN_HEALTHY_PULSE_BYTES;
}

function sampleStream(url, maxSec = SAMPLE_SEC) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const t0 = Date.now();
    let total = 0;
    let chunks = 0;
    let lastAt = 0;
    let maxGap = 0;
    let gapsOver25 = 0;
    let gapsOver5 = 0;
    let sync188 = 0;
    let firstByteMs = null;
    let status = 0;
    let error = null;

    // QoE simulation (edge meter style)
    let pulsePending = 0;
    let lastPulse = 0;
    let lastChunk = 0;
    let longestIdle = 0;
    let stallCount = 0;
    let prevPulseAt = 0;

    const finish = () => {
      const elapsed = (Date.now() - t0) / 1000;
      const mbps = elapsed > 0 ? (total * 8) / elapsed / 1_000_000 : 0;
      resolve({
        ok: !error && total > 50_000,
        status,
        error,
        elapsedSec: Math.round(elapsed),
        totalBytes: total,
        mbps: Number(mbps.toFixed(2)),
        chunks,
        firstByteMs,
        maxInterChunkGapMs: maxGap,
        gapsOver2_5s: gapsOver25,
        gapsOver5s: gapsOver5,
        sync188Ratio: chunks > 0 ? Number((sync188 / chunks).toFixed(3)) : 0,
        simulatedStalls: stallCount,
        projectedStallsPerHour: elapsed > 5 ? Math.round((stallCount / elapsed) * 3600) : null,
      });
    };

    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
          Connection: "close",
        },
        timeout: (maxSec + 15) * 1000,
      },
      (res) => {
        status = res.statusCode || 0;
        if (status >= 400) {
          error = `http_${status}`;
          res.resume();
          res.on("end", finish);
          return;
        }
        res.on("data", (buf) => {
          const now = Date.now();
          const n = buf.length;
          if (firstByteMs == null) firstByteMs = now - t0;
          if (lastAt > 0) {
            const gap = now - lastAt;
            if (gap > maxGap) maxGap = gap;
            if (gap >= 2500) gapsOver25++;
            if (gap >= 5000) gapsOver5++;
          }
          lastAt = now;
          total += n;
          chunks++;
          if (buf[0] === 0x47) sync188++;

          // meter
          if (lastChunk > 0) {
            const g = now - lastChunk;
            if (g > longestIdle) longestIdle = g;
          }
          lastChunk = now;
          pulsePending += n;
          if (lastPulse === 0) lastPulse = now;
          if (now - lastPulse >= PULSE_MS) {
            const pulseGap = prevPulseAt ? now - prevPulseAt : PULSE_MS;
            if (pulseLooksLikeStall(pulseGap, pulsePending, longestIdle)) stallCount++;
            pulsePending = 0;
            prevPulseAt = now;
            lastPulse = now;
            longestIdle = 0;
          }
        });
        res.on("end", finish);
        res.on("error", (e) => {
          error = e.message;
          finish();
        });
        setTimeout(() => {
          try {
            req.destroy();
          } catch {
            /* ignore */
          }
        }, maxSec * 1000);
      }
    );
    req.on("error", (e) => {
      error = e.message;
      finish();
    });
    req.on("timeout", () => {
      error = "timeout";
      req.destroy();
    });
  });
}

(async () => {
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { username: true, password: true },
  });
  if (!line) throw new Error("no active line");

  const out = [];

  for (const q of NAMES) {
    const stream = await p.stream.findFirst({
      where: { type: "LIVE", isActive: true, name: { contains: q, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        playlistUrl: true,
        vodMode: true,
        isOnDemand: true,
        lastProbeOk: true,
        lastProbeError: true,
      },
      orderBy: { name: "asc" },
    });
    if (!stream) {
      out.push({ query: q, error: "not_found" });
      continue;
    }

    const numId = streamNumericId(stream.id);
    const upstream = (stream.streamUrl || "").trim();
    const panelUrl = `http://127.0.0.1:8080/live/${line.username}/${line.password}/${numId}.ts`;

    const [upstreamSample, panelSample] = await Promise.all([
      upstream ? sampleStream(upstream) : Promise.resolve({ ok: false, error: "no_url" }),
      sampleStream(panelUrl),
    ]);

    out.push({
      name: stream.name,
      id: stream.id,
      numericId: numId,
      vodMode: stream.vodMode,
      isOnDemand: stream.isOnDemand,
      policy: policy(stream),
      originHost: hostOf(upstream),
      lastProbeOk: stream.lastProbeOk,
      lastProbeError: stream.lastProbeError,
      upstreamUrl: upstream.slice(0, 90),
      upstream: upstreamSample,
      panelSplice: panelSample,
    });
  }

  console.log(JSON.stringify({ sampledSec: SAMPLE_SEC, line: line.username, channels: out }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
