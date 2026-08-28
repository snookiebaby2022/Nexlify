#!/usr/bin/env node
/** Diagnose probe vs IPTV playback for a channel by name substring. */
const { PrismaClient } = require("@prisma/client");
const { createHash } = require("crypto");
const http = require("http");
const https = require("https");

const nameQuery = process.argv[2] || "Young Dracula";
const streamIdArg = process.argv[3] || "";
const p = new PrismaClient();

function streamNumericId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fetchHead(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method: "HEAD", timeout: timeoutMs, headers: { "User-Agent": "Nexlify-Probe-Diag/1.0" } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
    });
    req.on("error", (e) => resolve({ status: 0, ok: false, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, ok: false, error: "timeout" });
    });
    req.end();
  });
}

function fetchBytes(url, maxBytes = 8192, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Range: "bytes=0-8191" },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (chunks.length < 4) chunks.push(c);
          if (size >= maxBytes) req.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            size,
            magic: buf.slice(0, 4).toString("hex"),
            textHead: buf.slice(0, 80).toString("utf8").replace(/\s+/g, " ").slice(0, 80),
          });
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

(async () => {
  const stream = streamIdArg
    ? await p.stream.findUnique({
        where: { id: streamIdArg },
        include: { server: true, provider: true },
      })
    : await p.stream.findFirst({
        where: { name: { contains: nameQuery, mode: "insensitive" }, type: "LIVE" },
        include: { server: true, provider: true },
      });
  if (!stream) {
    console.log(JSON.stringify({ error: `No LIVE stream matching "${nameQuery}"` }, null, 2));
    process.exit(1);
  }

  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { username: true, password: true, id: true },
  });

  const numId = streamNumericId(stream.id);
  const panelPaths = line
    ? {
        ts8080: `http://127.0.0.1:8080/live/${line.username}/${line.password}/${numId}.ts`,
        ts13000: `http://127.0.0.1:13000/live/${line.username}/${line.password}/${numId}.ts`,
        m3u8: `http://127.0.0.1:13000/live/${line.username}/${line.password}/${numId}.m3u8`,
      }
    : null;

  const proc = await p.streamProcess.findFirst({
    where: { streamId: stream.id },
    orderBy: { lastSeenAt: "desc" },
    select: { status: true, errorMessage: true, lastSeenAt: true, serverId: true },
  });

  const upstream = stream.streamUrl?.trim() || "";
  const playlist = stream.playlistUrl?.trim() || "";
  const probeTarget = playlist || upstream;

  const [upstreamHead, upstreamGet, playlistHead, panelTs, panelM3u8] = await Promise.all([
    upstream ? fetchHead(upstream) : Promise.resolve(null),
    upstream ? fetchBytes(upstream) : Promise.resolve(null),
    playlist ? fetchHead(playlist) : Promise.resolve(null),
    panelPaths?.ts13000 ? fetchBytes(panelPaths.ts13000) : Promise.resolve(null),
    panelPaths?.m3u8 ? fetchBytes(panelPaths.m3u8) : Promise.resolve(null),
  ]);

  console.log(
    JSON.stringify(
      {
        stream: {
          id: stream.id,
          name: stream.name,
          numericId: numId,
          isActive: stream.isActive,
          isCreatedChannel: stream.isCreatedChannel,
          isOnDemand: stream.isOnDemand,
          vodMode: stream.vodMode,
          hostedExternally: stream.hostedExternally,
          lastProbeOk: stream.lastProbeOk,
          lastProbeError: stream.lastProbeError,
          server: stream.server ? { id: stream.server.id, name: stream.server.name, host: stream.server.host } : null,
          streamUrl: upstream,
          playlistUrl: playlist || null,
          backupUrl: stream.backupUrl || null,
          agentStartCmd: stream.agentStartCmd ? String(stream.agentStartCmd).slice(0, 200) : null,
        },
        process: proc,
        probeTarget,
        upstreamHead,
        upstreamGet,
        playlistHead,
        panelPaths,
        panelPlayback: { ts13000: panelTs, m3u8: panelM3u8 },
        line: line ? { username: line.username } : null,
      },
      null,
      2
    )
  );

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
