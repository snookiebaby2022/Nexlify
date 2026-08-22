#!/usr/bin/env node
/**
 * IPTV edge — Host sanitizer + XUI-style live/VOD byte pipe + disk HLS.
 *
 * Xtream apps hit :80/:8080/:25461. Auth stays on the panel; MPEG-TS/MP4 is
 * fetched from stream_source with a VLC UA so the origin sees the panel IP.
 * HLS segments are served directly from /var/lib/nexlify/hls (no Next.js hop).
 *
 * Env:
 *   IPTV_EDGE_BACKEND=127.0.0.1:13000
 *   IPTV_EDGE_HTTP_PORTS=80,8080,25461
 *   IPTV_EDGE_HTTPS_PORTS=
 *   PANEL_INTERNAL_SECRET=...
 *   NEXLIFY_HLS_DIR=/var/lib/nexlify/hls
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}
loadDotEnv();

const BACKEND = process.env.IPTV_EDGE_BACKEND || "127.0.0.1:13000";
const [backendHost, backendPortRaw] = BACKEND.split(":");
const backendPort = Number(backendPortRaw || 13000);
/** Retry panel upstream while nexlify restarts (ECONNREFUSED on :13000). */
const BACKEND_RETRY_MS = Number(process.env.IPTV_EDGE_BACKEND_RETRY_MS || 500);
const BACKEND_RETRY_MAX = Number(process.env.IPTV_EDGE_BACKEND_RETRY_MAX || 15);
const INTERNAL_SECRET =
  process.env.PANEL_INTERNAL_SECRET ||
  process.env.NEXLIFY_PANEL_API_SECRET ||
  process.env.PANEL_API_SECRET ||
  "";
const HLS_DIR = (process.env.NEXLIFY_HLS_DIR || "/var/lib/nexlify/hls").replace(/\/+$/, "");
/** Live HLS must be written within this window or we forward to Next (starts ffmpeg). */
const HLS_LIVE_MAX_AGE_MS = Number(process.env.NEXLIFY_HLS_LIVE_MAX_AGE_MS || 6000);
const HLS_DAEMON_PORT = Number(process.env.NEXLIFY_HLS_DAEMON_PORT || 13081);
const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
const LIVE_TS_PEEK_BYTES = 188;
const LIVE_TS_OPEN_MS = Number(process.env.IPTV_EDGE_TS_OPEN_MS || 2000);
/** Cache live-auth at edge so channel zaps skip panel round-trip (45s default). */
const AUTH_CACHE_TTL_MS = Number(process.env.IPTV_EDGE_AUTH_CACHE_MS || 45_000);
const authCache = new Map();
const PLAYBACK_RE = /^\/(live|movie|series)\//;
const HLS_RE = /\.m3u8(?:[?#]|$)/i;
const HLS_SEG_RE = /^\/live\/([^/]+)\/([^/]+)\/([^/]+)\/hls\/(seg\d+\.ts)$/i;
const LIVE_M3U8_RE = /^\/live\/([^/]+)\/([^/]+)\/([^/]+)\.m3u8$/i;

function parsePorts(raw, fallback) {
  const s = (raw ?? fallback ?? "").trim();
  if (!s) return [];
  return [...new Set(s.split(/[,\s]+/).map((p) => Number(p)).filter((n) => n > 0 && n < 65536))];
}

function sanitizeHostHeader(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  t = t.replace(/^https?:\/\//i, "");
  t = t.split("/")[0]?.split("?")[0]?.split("#")[0] ?? t;
  t = t.trim();
  if (t.startsWith("[")) {
    const m = t.match(/^\[([^\]]+)](?::(\d{1,5}))?$/i);
    if (m) return m[2] ? `[${m[1]}]:${m[2]}` : m[1];
  }
  return t;
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  let ip = fwd || req.socket.remoteAddress || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

function pulseConnection(ctx, bytes) {
  if (!INTERNAL_SECRET || !ctx?.lineId || !ctx?.streamId) return;
  touchPlaybackSession(ctx);
  const n = Math.max(0, Math.floor(bytes ?? 0));
  const body = JSON.stringify({
    lineId: ctx.lineId,
    streamId: ctx.streamId,
    ip: ctx.ip ?? "",
    bytes: n,
  });
  const req = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: "/api/internal/connection-pulse",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
      },
      timeout: 3000,
    },
    (res) => res.resume()
  );
  req.on("error", () => undefined);
  req.on("timeout", () => req.destroy());
  req.write(body);
  req.end();
}

function querySessionKicked(lineId, ip) {
  if (!INTERNAL_SECRET || !lineId) return Promise.resolve(false);
  const q = new URLSearchParams({ lineId, ip: ip ?? "" });
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: `/api/internal/session-kicked?${q}`,
        method: "GET",
        headers: { "x-panel-internal-secret": INTERNAL_SECRET },
        timeout: 2000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data).kicked === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** Abort upstream/client pipes within ~1s when admin kicks the session. */
function watchSessionKick(pulseCtx, onKicked) {
  if (!pulseCtx?.lineId || !INTERNAL_SECRET) return () => undefined;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    void querySessionKicked(pulseCtx.lineId, pulseCtx.ip).then((kicked) => {
      if (kicked && !stopped) onKicked();
    });
  };
  tick();
  const timer = setInterval(tick, 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function clearPlaybackSession(ctx) {
  if (!ctx?.lineId || !ctx?.streamId) return;
  const key = playbackSessionKey(ctx);
  const session = playbackSessions.get(key);
  if (session) {
    clearInterval(session.timer);
    playbackSessions.delete(key);
  }
}

function endPlaybackSession(ctx) {
  if (!INTERNAL_SECRET || !ctx?.lineId || !ctx?.streamId) return;
  clearPlaybackSession(ctx);
  const body = JSON.stringify({
    lineId: ctx.lineId,
    streamId: ctx.streamId,
    ip: ctx.ip ?? "",
  });
  const req = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: "/api/internal/connection-end",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
      },
      timeout: 3000,
    },
    (res) => res.resume()
  );
  req.on("error", () => undefined);
  req.on("timeout", () => req.destroy());
  req.write(body);
  req.end();
}

/** Keep panel live rows fresh while MPEG-TS/HLS clients are connected (XUI-style). */
const playbackSessions = new Map();
const SESSION_KEEPALIVE_MS = 8_000;
const SESSION_IDLE_MS = 240_000;

function playbackSessionKey(ctx) {
  return `${ctx.lineId}|${ctx.ip ?? ""}|${ctx.streamId}`;
}

function stopOtherPlaybackSessions(ctx) {
  const prefix = `${ctx.lineId}|${ctx.ip ?? ""}|`;
  const myKey = playbackSessionKey(ctx);
  for (const [key, session] of [...playbackSessions.entries()]) {
    if (!key.startsWith(prefix) || key === myKey) continue;
    clearInterval(session.timer);
    playbackSessions.delete(key);
  }
}

function touchPlaybackSession(ctx) {
  if (!ctx?.lineId || !ctx?.streamId) return;
  stopOtherPlaybackSessions(ctx);
  const key = playbackSessionKey(ctx);
  const now = Date.now();
  let session = playbackSessions.get(key);
  if (!session) {
    session = { ctx, lastClientAt: now };
    session.timer = setInterval(() => {
      const idle = Date.now() - session.lastClientAt;
      if (idle > SESSION_IDLE_MS) {
        clearInterval(session.timer);
        playbackSessions.delete(key);
        return;
      }
      pulseConnection(session.ctx, 72_000);
    }, SESSION_KEEPALIVE_MS);
    playbackSessions.set(key, session);
    pulseConnection(ctx, 72_000);
    return;
  }
  session.lastClientAt = now;
}

function createLiveByteMeter(pulseCtx) {
  if (!pulseCtx?.lineId || !pulseCtx?.streamId) return () => undefined;
  touchPlaybackSession(pulseCtx);
  let pending = 0;
  let lastPulse = 0;
  return (chunk) => {
    const n = chunk?.length ?? 0;
    if (n <= 0) return;
    pending += n;
    const now = Date.now();
    if (lastPulse === 0) lastPulse = now;
    if (now - lastPulse >= 3_000 || pending >= 128_000) {
      pulseConnection(pulseCtx, pending);
      pending = 0;
      lastPulse = now;
    }
  };
}

function parseOutboundProxyHeader(raw) {
  const s = String(raw || "").trim();
  if (!s || /^socks5:/i.test(s)) return null;
  try {
    const u = new URL(s);
    return {
      type: u.protocol === "https:" ? "HTTPS" : "HTTP",
      host: u.hostname,
      port: Number(u.port || (u.protocol === "https:" ? 443 : 80)),
      username: u.username ? decodeURIComponent(u.username) : "",
      password: u.password ? decodeURIComponent(u.password) : "",
    };
  } catch {
    return null;
  }
}

function connectOriginSocket(targetUrl, proxy, timeoutMs) {
  const target = new URL(targetUrl);
  if (!proxy) {
    return new Promise((resolve, reject) => {
      const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
      const socket = net.connect({ host: target.hostname, port, timeout: timeoutMs });
      socket.once("connect", () => {
        socket.setTimeout(0);
        resolve(socket);
      });
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("Direct connect timeout"));
      });
    });
  }

  const connectHost = target.hostname;
  const connectPort = target.port || (target.protocol === "https:" ? "443" : "80");
  const proxyPort = proxy.port || (proxy.type === "HTTPS" ? 443 : 80);
  const headers = { Host: `${connectHost}:${connectPort}` };
  if (proxy.username || proxy.password) {
    headers["Proxy-Authorization"] = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host,
      port: proxyPort,
      method: "CONNECT",
      path: `${connectHost}:${connectPort}`,
      headers,
      timeout: timeoutMs,
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT HTTP ${res.statusCode}`));
        return;
      }
      socket.setTimeout(0);
      resolve(socket);
    });
    req.on("timeout", () => req.destroy(new Error("Proxy CONNECT timeout")));
    req.on("error", reject);
    req.end();
  });
}

function shouldSniffLiveTs(upRes) {
  const ct = String(upRes.headers["content-type"] || "").toLowerCase();
  if (ct.includes("html") || ct.includes("json") || ct.includes("xml") || ct.startsWith("text/")) return true;
  if (!ct || ct.includes("octet-stream") || ct.includes("mp2t") || ct.startsWith("video/") || ct.startsWith("audio/")) {
    return false;
  }
  return true;
}

function normalizeUpstreamUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    if (u.protocol === "https:" && u.port === "443") u.port = "";
    if (u.protocol === "http:" && u.port === "80") u.port = "";
    return u.toString();
  } catch {
    return url;
  }
}

function looksLikeMpegTs(buf) {
  if (!buf?.length || buf[0] !== 0x47) return false;
  if (buf.length >= 376 && buf[188] === 0x47) return true;
  return buf.length >= 188;
}

function touchHlsDaemon(streamId) {
  if (!INTERNAL_SECRET || !streamId) return;
  const body = JSON.stringify({ streamId });
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: HLS_DAEMON_PORT,
      path: "/touch",
      method: "POST",
      headers: {
        Authorization: `Bearer ${INTERNAL_SECRET}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 800,
    },
    (res) => res.resume()
  );
  req.on("error", () => undefined);
  req.on("timeout", () => req.destroy());
  req.write(body);
  req.end();
}

function shouldSplice(req) {
  const pathOnly = String(req.url || "/").split("?")[0];
  if (!PLAYBACK_RE.test(pathOnly)) return false;
  if (HLS_RE.test(pathOnly) || /\/hls\//i.test(pathOnly)) return false;
  return true;
}

function liveTsHeaders() {
  return {
    "Content-Type": "video/mp2t",
    "Cache-Control": "no-cache, no-store, no-transform",
    Connection: "close",
    "Accept-Ranges": "none",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  };
}

function hlsPlaylistHeaders() {
  return {
    "Content-Type": "application/x-mpegURL",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    "Accept-Ranges": "none",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  };
}

function hlsSegHeaders(len) {
  return {
    "Content-Type": "video/mp2t",
    "Content-Length": String(len),
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    "Accept-Ranges": "none",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  };
}

function isBackendRetryable(err) {
  const code = String(err?.code || "");
  return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH";
}

function forward(clientReq, clientRes, { listenPort, proto }) {
  const cleanHost = sanitizeHostHeader(clientReq.headers.host) || backendHost;
  const headers = { ...clientReq.headers };
  headers.host = cleanHost;
  headers["x-forwarded-host"] = cleanHost.split(":")[0];
  headers["x-forwarded-proto"] = proto;
  headers["x-forwarded-port"] = String(listenPort);
  headers["x-nexlify-client-port"] = String(listenPort);
  headers["x-forwarded-for"] = clientIp(clientReq);
  const method = (clientReq.method || "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let attempt = 0;

  function sendToBackend() {
    attempt++;
    const proxyReq = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: clientReq.url,
        method: clientReq.method,
        headers,
        timeout: 300_000,
      },
      (proxyRes) => {
        const hdrs = { ...proxyRes.headers };
        delete hdrs["vary"];
        delete hdrs["x-frame-options"];
        delete hdrs["x-content-type-options"];
        delete hdrs["referrer-policy"];
        delete hdrs["permissions-policy"];
        delete hdrs["x-robots-tag"];
        delete hdrs["strict-transport-security"];
        clientRes.writeHead(proxyRes.statusCode || 502, hdrs);
        proxyRes.pipe(clientRes);
      }
    );
    proxyReq.on("error", (err) => {
      if (
        !clientRes.headersSent &&
        !hasBody &&
        attempt < BACKEND_RETRY_MAX &&
        isBackendRetryable(err)
      ) {
        setTimeout(sendToBackend, BACKEND_RETRY_MS);
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "content-type": "text/plain" });
      }
      clientRes.end(`iptv-edge proxy error: ${err.message}`);
    });
    if (hasBody) clientReq.pipe(proxyReq);
    else proxyReq.end();
  }

  sendToBackend();
}

function authCacheKey(clientReq) {
  return `${clientIp(clientReq)}:${clientReq.url || "/"}`;
}

function authLive(clientReq) {
  return new Promise((resolve, reject) => {
    const headers = {
      "x-original-uri": clientReq.url || "/",
      "x-original-method": clientReq.method || "GET",
      "x-panel-internal-secret": INTERNAL_SECRET,
      "x-forwarded-for": clientIp(clientReq),
      "x-real-ip": clientIp(clientReq),
      "user-agent": clientReq.headers["user-agent"] || "",
      connection: "close",
    };
    let attempt = 0;

    function go() {
      attempt++;
      const req = http.request(
        {
          hostname: backendHost,
          port: backendPort,
          path: "/api/internal/live-auth",
          method: "GET",
          headers,
          timeout: 15_000,
        },
        (res) => {
          res.resume();
          resolve({
            status: res.statusCode || 502,
            upstream: String(res.headers["x-nexlify-upstream"] || ""),
            live: String(res.headers["x-nexlify-live"] || "") === "1",
            hlsNative: String(res.headers["x-nexlify-hls-native"] || "") === "1",
            passthrough: String(res.headers["x-nexlify-passthrough"] || "") === "1" || res.statusCode === 204,
            streamId: String(res.headers["x-nexlify-stream-id"] || ""),
            lineId: String(res.headers["x-nexlify-line-id"] || ""),
            outboundProxy: parseOutboundProxyHeader(res.headers["x-nexlify-outbound-proxy"]),
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("live-auth timeout")));
      req.on("error", (err) => {
        if (attempt < BACKEND_RETRY_MAX && isBackendRetryable(err)) {
          setTimeout(go, BACKEND_RETRY_MS);
          return;
        }
        reject(err);
      });
      req.end();
    }

    go();
  });
}

async function authLiveCached(clientReq) {
  const key = authCacheKey(clientReq);
  const hit = authCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  const data = await authLive(clientReq);
  if (data.status === 200 && (data.upstream || data.streamId)) {
    authCache.set(key, { expires: Date.now() + AUTH_CACHE_TTL_MS, data });
    if (authCache.size > 4096) {
      const oldest = authCache.keys().next().value;
      if (oldest) authCache.delete(oldest);
    }
  }
  return data;
}

function hlsStreamDir(streamId) {
  const safe = String(streamId).replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(HLS_DIR, safe || "unknown");
}

/** True when ffmpeg is actively writing this stream (not leftover files from a dead session). */
function hlsDirFresh(streamId) {
  const dir = hlsStreamDir(streamId);
  const indexPath = path.join(dir, "index.m3u8");
  try {
    if (!fs.existsSync(indexPath)) return false;
    if (Date.now() - fs.statSync(indexPath).mtimeMs > HLS_LIVE_MAX_AGE_MS) return false;
    const body = fs.readFileSync(indexPath, "utf8");
    if (!body.includes("#EXTM3U") || !body.includes("#EXTINF")) return false;
    const segs = body.match(/seg\d+\.ts/gi);
    if (!segs?.length || segs.length < 2) return false;
    const seqM = body.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
    if (seqM && Number(seqM[1]) < 1) return false;
    const last = segs[segs.length - 1];
    const segPath = path.join(dir, last);
    if (!fs.existsSync(segPath)) return false;
    return Date.now() - fs.statSync(segPath).mtimeMs <= HLS_LIVE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function filterPlaylistToExisting(body, dir) {
  const lines = body.split("\n");
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#EXT-X-DISCONTINUITY")) continue;
    const name = t.split(/[\\/]/).pop() ?? t;
    if (/^seg\d+\.ts$/i.test(name)) {
      if (!fs.existsSync(path.join(dir, name))) {
        if (out.length && out[out.length - 1].trim().startsWith("#EXTINF")) out.pop();
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

function hlsSegPath(streamId, segName) {
  if (!/^seg\d+\.ts$/i.test(segName)) return null;
  return path.join(hlsStreamDir(streamId), segName);
}

function serveHlsSegment(streamId, segName, clientRes, pulseCtx) {
  const segPath = hlsSegPath(streamId, segName);
  if (!segPath) return false;
  try {
    if (!fs.existsSync(segPath)) return false;
    const buf = fs.readFileSync(segPath);
    if (!buf.length) return false;
    if (pulseCtx) pulseConnection(pulseCtx, buf.length);
    clientRes.writeHead(200, hlsSegHeaders(buf.length));
    clientRes.end(buf);
    return true;
  } catch {
    return false;
  }
}

function serveHlsPlaylist(streamId, clientReq, clientRes, pulseCtx) {
  const dir = hlsStreamDir(streamId);
  const indexPath = path.join(dir, "index.m3u8");
  try {
    if (!fs.existsSync(indexPath)) return false;
    let body = filterPlaylistToExisting(fs.readFileSync(indexPath, "utf8"), dir);
    if (!body.includes("#EXTM3U") || !body.includes("#EXTINF") || !/seg\d+\.ts/i.test(body)) return false;
    const urlPath = String(clientReq.url || "/").split("?")[0];
    const base = urlPath.replace(/\.m3u8$/i, "");
    const lines = body.split("\n").map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      const name = t.split(/[\\/]/).pop() ?? t;
      if (/^seg\d+\.ts$/i.test(name)) {
        return `${base}/hls/${name}`;
      }
      return line;
    });
    const out = lines.join("\n");
    if (pulseCtx) pulseConnection(pulseCtx, Buffer.byteLength(out));
    clientRes.writeHead(200, hlsPlaylistHeaders());
    clientRes.end(out);
    return true;
  } catch {
    return false;
  }
}

function pipeLiveMpegTs(upRes, clientReq, clientRes, pulseCtx) {
  const meter = pulseCtx ? createLiveByteMeter(pulseCtx) : null;
  let stopKickWatch = () => undefined;
  const stopStream = () => {
    stopKickWatch();
    try {
      upRes.destroy();
    } catch {
      /* ignore */
    }
    try {
      if (!clientRes.writableEnded) clientRes.end();
    } catch {
      /* ignore */
    }
  };
  stopKickWatch = watchSessionKick(pulseCtx, stopStream);
  clientReq.once("close", () => {
    stopKickWatch();
    endPlaybackSession(pulseCtx);
  });
  clientReq.once("aborted", () => {
    stopKickWatch();
    endPlaybackSession(pulseCtx);
  });
  if (!shouldSniffLiveTs(upRes)) {
    clientRes.writeHead(200, liveTsHeaders());
    if (meter) upRes.on("data", meter);
    upRes.pipe(clientRes);
    upRes.once("close", stopKickWatch);
    upRes.once("error", stopKickWatch);
    return;
  }

  const chunks = [];
  let total = 0;
  let headersSent = false;

  const fail = (msg) => {
    stopKickWatch();
    upRes.destroy();
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end(msg);
    } else {
      clientRes.end();
    }
  };

  const flush = () => {
    if (headersSent) return;
    upRes.removeListener("data", onData);
    upRes.removeListener("error", onError);
    clearTimeout(openTimer);
    const prefix = Buffer.concat(chunks);
    if (!looksLikeMpegTs(prefix)) {
      fail("Upstream is not MPEG-TS");
      return;
    }
    clientRes.writeHead(200, liveTsHeaders());
    headersSent = true;
    clientRes.write(prefix);
    if (meter) {
      meter(prefix);
      upRes.on("data", meter);
    }
    upRes.pipe(clientRes);
  };

  const onData = (chunk) => {
    if (headersSent) return;
    chunks.push(chunk);
    total += chunk.length;
    if (total < LIVE_TS_PEEK_BYTES) return;
    flush();
  };

  const onError = (err) => {
    if (!headersSent) fail(`upstream error: ${err.message}`);
  };

  const openTimer = setTimeout(() => {
    if (headersSent) return;
    fail("Upstream timeout before MPEG-TS data");
  }, LIVE_TS_OPEN_MS);

  upRes.on("data", onData);
  upRes.once("error", onError);
  upRes.once("end", () => {
    if (headersSent) return;
    clearTimeout(openTimer);
    upRes.removeListener("data", onData);
    const prefix = Buffer.concat(chunks);
    if (looksLikeMpegTs(prefix)) {
      clientRes.writeHead(200, liveTsHeaders());
      clientRes.write(prefix);
      if (meter) meter(prefix);
      clientRes.end();
      return;
    }
    fail("Upstream closed before MPEG-TS data");
  });
}

function pipeUpstream(targetUrl, clientReq, clientRes, { live, redirectsLeft, listenPort, proto, proxy, altProtocolLeft, pulseCtx }) {
  targetUrl = normalizeUpstreamUrl(targetUrl);
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Invalid upstream");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Unsupported upstream");
    return;
  }
  const lib = parsed.protocol === "https:" ? https : http;
  const headers = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    Connection: "keep-alive",
    "Icy-MetaData": "0",
  };
  if (!live && clientReq.headers.range) headers.Range = clientReq.headers.range;
  delete headers.range;

  const reqOpts = {
    hostname: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
    method: "GET",
    path: `${parsed.pathname}${parsed.search}`,
    headers: {
      ...headers,
      Host: parsed.host,
    },
    timeout: 300_000,
  };
  if (parsed.protocol === "https:") reqOpts.rejectUnauthorized = false;
  if (proxy) {
    reqOpts.createConnection = (_opts, cb) => {
      connectOriginSocket(parsed.toString(), proxy, 30_000)
        .then((socket) => cb(null, socket))
        .catch((err) => cb(err, undefined));
    };
  }

  const up = lib.request(reqOpts, (upRes) => {
    const status = upRes.statusCode || 0;
    const loc = upRes.headers.location;
    if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
      upRes.resume();
      let next;
      try {
        next = new URL(loc, parsed).toString();
      } catch {
        clientRes.writeHead(502, { "content-type": "text/plain" });
        clientRes.end("Bad upstream redirect");
        return;
      }
      pipeUpstream(next, clientReq, clientRes, {
        live,
        redirectsLeft: redirectsLeft - 1,
        listenPort,
        proto,
        proxy,
        altProtocolLeft,
        pulseCtx,
      });
      return;
    }
    if (status < 200 || status >= 300) {
      upRes.resume();
      if (altProtocolLeft > 0) {
        try {
          const alt = new URL(parsed.toString());
          alt.protocol = alt.protocol === "https:" ? "http:" : "https:";
          pipeUpstream(alt.toString(), clientReq, clientRes, {
            live,
            redirectsLeft,
            listenPort,
            proto,
            proxy,
            altProtocolLeft: altProtocolLeft - 1,
            pulseCtx,
          });
          return;
        } catch {
          /* fall through */
        }
      }
      // Provider auth errors: fall back to Next.js (HLS remux, outbound proxy, disk packager).
      if (live && (status === 401 || status === 403 || status === 407)) {
        forward(clientReq, clientRes, { listenPort, proto });
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(status || 502, { "content-type": "text/plain" });
      }
      clientRes.end(`upstream HTTP ${status}`);
      return;
    }
    if (live) {
      const ct = String(upRes.headers["content-type"] || "").toLowerCase();
      const loc2 = String(upRes.headers.location || "");
      if (/mpegurl|x-mpegurl/.test(ct) || /\.m3u8/i.test(loc2)) {
        upRes.resume();
        up.destroy();
        forward(clientReq, clientRes, { listenPort, proto });
        return;
      }
      pipeLiveMpegTs(upRes, clientReq, clientRes, pulseCtx);
      return;
    }
    clientRes.writeHead(status || 502, upRes.headers);
    upRes.pipe(clientRes);
  });
  up.on("timeout", () => up.destroy(new Error("upstream timeout")));
  up.on("error", (err) => {
    if (altProtocolLeft > 0 && !clientRes.headersSent) {
      try {
        const alt = new URL(parsed.toString());
        alt.protocol = alt.protocol === "https:" ? "http:" : "https:";
        pipeUpstream(alt.toString(), clientReq, clientRes, {
          live,
          redirectsLeft,
          listenPort,
          proto,
          proxy,
          altProtocolLeft: altProtocolLeft - 1,
          pulseCtx,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end(`upstream error: ${err.message}`);
  });
  clientReq.on("close", () => up.destroy());
  up.end();
}

function denyAuth(clientRes, status) {
  clientRes.writeHead(status, { "content-type": "text/plain" });
  clientRes.end(status === 401 ? "Unauthorized" : "Forbidden");
}

/**
 * XUI-style disk HLS: auth first, then serve from /var/lib/nexlify/hls/<cuid>/.
 * URL stream keys are often numeric Xtream IDs; the packager directory is the cuid.
 * Disk miss forwards to Next so ensureDiskHls can start ffmpeg.
 */
async function handleDiskHls(clientReq, clientRes, ctx, kind, segName) {
  if (!INTERNAL_SECRET) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  let auth;
  try {
    auth = await authLiveCached(clientReq);
  } catch {
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (auth.status === 401 || auth.status === 403 || auth.status === 429) {
    denyAuth(clientRes, auth.status);
    return;
  }
  const pulseCtx =
    auth.lineId && auth.streamId
      ? { lineId: auth.lineId, streamId: auth.streamId, ip: clientIp(clientReq) }
      : null;
  if (pulseCtx) touchPlaybackSession(pulseCtx);
  // Provider-native .m3u8 must relay through Next (rewritten manifest + upstream segments).
  if (auth.hlsNative) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (auth.passthrough || auth.status !== 200 || !auth.streamId) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  const streamId = auth.streamId;
  touchHlsDaemon(streamId);
  const fresh = hlsDirFresh(streamId);
  if (!fresh) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (kind === "seg") {
    if (clientReq.method === "HEAD") {
      const segPath = hlsSegPath(streamId, segName);
      try {
        if (segPath) {
          const st = fs.statSync(segPath);
          if (st.isFile() && st.size > 0) {
            if (pulseCtx) pulseConnection(pulseCtx, st.size);
            clientRes.writeHead(200, hlsSegHeaders(st.size));
            clientRes.end();
            return;
          }
        }
      } catch {
        /* miss → Next */
      }
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (serveHlsSegment(streamId, segName, clientRes, pulseCtx)) return;
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (clientReq.method === "HEAD") {
    clientRes.writeHead(200, hlsPlaylistHeaders());
    clientRes.end();
    return;
  }
  if (serveHlsPlaylist(streamId, clientReq, clientRes, pulseCtx)) return;
  forward(clientReq, clientRes, ctx);
}

async function onRequest(clientReq, clientRes, ctx) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];

  if (clientReq.method === "OPTIONS") {
    clientRes.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept, Range",
    });
    clientRes.end();
    return;
  }

  const segMatch = pathOnly.match(HLS_SEG_RE);
  if (segMatch) {
    await handleDiskHls(clientReq, clientRes, ctx, "seg", segMatch[4]);
    return;
  }

  if (LIVE_M3U8_RE.test(pathOnly) && PLAYBACK_RE.test(pathOnly)) {
    await handleDiskHls(clientReq, clientRes, ctx, "playlist", "");
    return;
  }

  if (!shouldSplice(clientReq)) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (!INTERNAL_SECRET) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  try {
    const auth = await authLiveCached(clientReq);
    if (auth.passthrough || !auth.upstream) {
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (auth.status === 401 || auth.status === 403 || auth.status === 429) {
      clientRes.writeHead(auth.status, { "content-type": "text/plain" });
      clientRes.end(auth.status === 401 ? "Unauthorized" : "Forbidden");
      return;
    }
    if (auth.status !== 200) {
      forward(clientReq, clientRes, ctx);
      return;
    }
    const pulseCtx =
      auth.lineId && auth.streamId
        ? { lineId: auth.lineId, streamId: auth.streamId, ip: clientIp(clientReq) }
        : null;
    if (pulseCtx) touchPlaybackSession(pulseCtx);
    if (clientReq.method === "HEAD") {
      clientRes.writeHead(200, auth.live ? liveTsHeaders() : { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" });
      clientRes.end();
      return;
    }
    pipeUpstream(auth.upstream, clientReq, clientRes, {
      live: auth.live,
      redirectsLeft: 5,
      altProtocolLeft: 1,
      proxy: auth.outboundProxy,
      pulseCtx,
      ...ctx,
    });
  } catch {
    forward(clientReq, clientRes, ctx);
  }
}

function listenHttp(port) {
  const server = http.createServer((req, res) => onRequest(req, res, { listenPort: port, proto: "http" }));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] http://0.0.0.0:${port} → ${BACKEND} (live splice + disk HLS)`);
  });
  server.on("error", (err) => {
    console.error(`[iptv-edge] http :${port} failed:`, err.message);
    process.exitCode = 1;
  });
  return server;
}

function listenHttps(port, cert, key) {
  const server = https.createServer({ cert, key }, (req, res) =>
    onRequest(req, res, { listenPort: port, proto: "https" })
  );
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] https://0.0.0.0:${port} → ${BACKEND} (live splice + disk HLS)`);
  });
  server.on("error", (err) => {
    console.error(`[iptv-edge] https :${port} failed:`, err.message);
    process.exitCode = 1;
  });
  return server;
}

const httpPorts = parsePorts(process.env.IPTV_EDGE_HTTP_PORTS, "80,8080,25461");
const httpsPorts = parsePorts(process.env.IPTV_EDGE_HTTPS_PORTS, "443");
const certPath = process.env.IPTV_EDGE_CERT || "/etc/nginx/ssl/nexlify-panel/fullchain.pem";
const keyPath = process.env.IPTV_EDGE_KEY || "/etc/nginx/ssl/nexlify-panel/privkey.pem";

for (const p of httpPorts) listenHttp(p);

if (httpsPorts.length) {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error(`[iptv-edge] missing TLS cert/key at ${certPath} / ${keyPath}`);
    process.exit(1);
  }
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  for (const p of httpsPorts) listenHttps(p, cert, key);
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
