#!/usr/bin/env node
/**
 * Deep probe: specific stream IDs + upstream URLs from operator screenshots.
 * Usage: node scripts/_tmp-probe-specific-streams.mjs
 */
import { PrismaClient } from "@prisma/client";
import http from "node:http";
import https from "node:https";

const IDS = [
  "cmthofi8w01xnvh27nmxr628m", // BBC One HD on-demand (junki3) — from earlier probe
  "cmtgxc8jt00zvhgx7xmhosf", // BBC One HD live (zee-portal)
  "cmtcp5to201cevh0wmmpcuxfd", // ITV 1 FHD live
];

const NAMES = [
  "Sky Sports Premier League HEVC HB",
  "Sky Sports Premier League HEVC LB",
];

const SAMPLE_SEC = 30;
const UPSTREAM_SAMPLE_SEC = 20;
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

function pulseLooksLikeStall(gapMs, byteLen, idleMs = 0) {
  if (idleMs >= PLAYER_STALL_IDLE_MS) return true;
  if (gapMs < STALL_GAP_MS) return false;
  return byteLen < MIN_HEALTHY_PULSE_BYTES;
}

function headUrl(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      { method: "HEAD", timeout: timeoutMs, headers: { "User-Agent": "VLC/3.0.20" } },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode,
          location: res.headers.location || null,
          ct: res.headers["content-type"] || null,
        });
      }
    );
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    req.end();
  });
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
    let sync188 = 0;
    let firstByteMs = null;
    let status = 0;
    let error = null;
    let pulsePending = 0;
    let lastPulse = 0;
    let lastChunk = 0;
    let longestIdle = 0;
    let stallCount = 0;
    let prevPulseAt = 0;

    const finish = () => {
      const elapsed = (Date.now() - t0) / 1000;
      resolve({
        ok: !error && total > 50_000 && status >= 200 && status < 400,
        status,
        error,
        elapsedSec: Math.round(elapsed),
        totalBytes: total,
        mbps: elapsed > 0 ? Number(((total * 8) / elapsed / 1_000_000).toFixed(2)) : 0,
        firstByteMs,
        maxInterChunkGapMs: maxGap,
        gapsOver2_5s: gapsOver25,
        sync188Ratio: chunks > 0 ? Number((sync188 / chunks).toFixed(3)) : 0,
        simulatedStallsPer45s: stallCount,
      });
    };

    const req = lib.get(
      url,
      {
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Connection: "close" },
        timeout: (maxSec + 20) * 1000,
      },
      (res) => {
        status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          error = `redirect_${status}`;
          res.resume();
          res.on("end", finish);
          return;
        }
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
          }
          lastAt = now;
          total += n;
          chunks++;
          if (buf[0] === 0x47) sync188++;
          if (lastChunk > 0) longestIdle = Math.max(longestIdle, now - lastChunk);
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

async function probeStream(stream, line) {
  const numId = streamNumericId(stream.id);
  const panelUrl = `http://127.0.0.1:8080/live/${line.username}/${line.password}/${numId}.ts`;
  const urls = [
    { label: "primary", url: stream.streamUrl?.trim() || "" },
    { label: "backup", url: stream.backupUrl?.trim() || "" },
    { label: "panel_splice", url: panelUrl },
  ].filter((u) => u.url);

  const results = {};
  for (const { label, url } of urls) {
    const sec = label === "panel_splice" ? SAMPLE_SEC : UPSTREAM_SAMPLE_SEC;
    const [head, sample] = await Promise.all([headUrl(url), sampleStream(url, sec)]);
    results[label] = { url: url.slice(0, 100), host: hostOf(url), head, sample };
  }
  return {
    id: stream.id,
    name: stream.name,
    numericId: numId,
    vodMode: stream.vodMode,
    isOnDemand: stream.isOnDemand,
    isActive: stream.isActive,
    lastProbeOk: stream.lastProbeOk,
    lastProbeError: stream.lastProbeError,
    probes: results,
  };
}

(async () => {
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { username: true, password: true },
  });
  if (!line) throw new Error("no active line");

  const out = [];

  for (const id of IDS) {
    const stream = await p.stream.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        backupUrl: true,
        vodMode: true,
        isOnDemand: true,
        isActive: true,
        lastProbeOk: true,
        lastProbeError: true,
      },
    });
    if (!stream) {
      out.push({ id, error: "not_found" });
      continue;
    }
    out.push(await probeStream(stream, line));
  }

  for (const q of NAMES) {
    const stream = await p.stream.findFirst({
      where: { type: "LIVE", isActive: true, name: { equals: q, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        backupUrl: true,
        vodMode: true,
        isOnDemand: true,
        isActive: true,
        lastProbeOk: true,
        lastProbeError: true,
      },
    });
    if (!stream) {
      out.push({ query: q, error: "not_found" });
      continue;
    }
    out.push(await probeStream(stream, line));
  }

  // Also list ALL BBC One HD rows for comparison
  const bbcRows = await p.stream.findMany({
    where: { type: "LIVE", name: { equals: "BBC One HD", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      vodMode: true,
      isOnDemand: true,
      isActive: true,
      streamUrl: true,
    },
    orderBy: { isActive: "desc" },
  });

  console.log(
    JSON.stringify(
      { sampledSec: SAMPLE_SEC, line: line.username, probes: out, allBbcOneHdRows: bbcRows },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
