#!/usr/bin/env node
/**
 * IPTV edge — Host sanitizer + XUI-style live/VOD byte pipe + disk HLS.
 * Canonical scripts/iptv-edge-proxy.mjs source; installer copies must be generated from this file.
 *
 * Xtream apps hit :80/:8080/:25461. Auth stays on the panel; MPEG-TS/MP4 is
 * fetched from stream_source with a VLC UA so the origin sees the panel IP.
 * HLS segments are served directly from /var/lib/nexlify/hls (no Next.js hop).
 *
 * Env:
 *   IPTV_EDGE_BACKEND=127.0.0.1:13000
 *   IPTV_EDGE_HTTP_PORTS=80,8080,25461
 *   IPTV_EDGE_HTTPS_PORTS=
 *   IPTV_EDGE_TRUST_XFF=loopback
 *   # Or a comma-separated list of trusted reverse-proxy IPs.
 *   PANEL_INTERNAL_SECRET=...
 *   NEXLIFY_HLS_DIR=/var/lib/nexlify/hls
 *
 * LOCKED playback rules: splice /live/ on this process. Never forward
 * /live|/timeshift|/movie|/series to IPTV_EDGE_BACKEND (502 loop).
 * Never HTTP 302 for media. Relock: bash scripts/lock-live-routing-45.sh
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  edgeRedisEnabled,
  edgeRedisGetAuth,
  edgeRedisSetAuth,
  edgeRedisGetSeg,
  edgeRedisSetSeg,
} from "./edge-redis-auth.mjs";

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
/** Cap sockets per pool so catalog dumps cannot starve login/health. */
const adminAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_ADMIN_SOCKETS || 128),
  maxFreeSockets: 32,
  timeout: 60_000,
});
const apiAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_API_SOCKETS || 512),
  maxFreeSockets: 64,
  timeout: 300_000,
});
const liveAgent = new http.Agent({
  // Short panel auth calls only — never used for upstream video bytes.
  keepAlive: false,
  maxSockets: Number(process.env.IPTV_EDGE_LIVE_SOCKETS || 512),
  timeout: 20_000,
});
/** Upstream CDN sockets for live MPEG-TS splice (high concurrency). */
const upstreamLiveHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_UPSTREAM_SOCKETS || 4096),
  maxFreeSockets: 512,
  keepAliveMsecs: 30_000,
  timeout: 300_000,
});
const upstreamLiveHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_UPSTREAM_SOCKETS || 4096),
  maxFreeSockets: 512,
  keepAliveMsecs: 30_000,
  timeout: 300_000,
  rejectUnauthorized: false,
});
const vodHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_VOD_SOCKETS || 256),
  maxFreeSockets: 16,
  keepAliveMsecs: 15_000,
  timeout: 300_000,
});
const vodHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Number(process.env.IPTV_EDGE_VOD_SOCKETS || 256),
  maxFreeSockets: 16,
  keepAliveMsecs: 15_000,
  timeout: 300_000,
  rejectUnauthorized: false,
});

function isAdminUiPath(urlPath) {
  const p = String(urlPath || "/").split("?")[0];
  return (
    p === "/" ||
    p.startsWith("/login") ||
    p.startsWith("/admin") ||
    p.startsWith("/reseller") ||
    p.startsWith("/portal") ||
    p.startsWith("/api/") ||
    p.startsWith("/_next") ||
    p.startsWith("/favicon")
  );
}

function isCatalogPath(urlPath) {
  const p = String(urlPath || "/").split("?")[0];
  return /\/(?:player_api|panel_api|get|xmltv)\.php$/i.test(p);
}

function isPanelPriorityPath(urlPath) {
  return isAdminUiPath(urlPath) || isCatalogPath(urlPath);
}

function backendAgentFor(urlPath) {
  const pathOnly = String(urlPath || "/").split("?")[0];
  // Panel UI/catalog must never queue behind a capped pool (one admin tab = 50+ parallel assets).
  if (isPanelPriorityPath(pathOnly)) return false;
  return liveAgent;
}
/** Retry panel upstream while nexlify restarts (ECONNREFUSED on :13000). */
const BACKEND_RETRY_MS = Number(process.env.IPTV_EDGE_BACKEND_RETRY_MS || 500);
const BACKEND_RETRY_MAX = Number(process.env.IPTV_EDGE_BACKEND_RETRY_MAX || 8);
const BACKEND_RETRY_BUDGET_MS = Number(process.env.IPTV_EDGE_BACKEND_RETRY_BUDGET_MS || 12_000);
const BACKEND_STARTUP_WAIT_MS = Number(process.env.IPTV_EDGE_BACKEND_WAIT_MS || 120_000);
const INTERNAL_SECRET =
  process.env.PANEL_INTERNAL_SECRET ||
  process.env.NEXLIFY_PANEL_API_SECRET ||
  process.env.PANEL_API_SECRET ||
  "";
const HLS_DIR = (process.env.NEXLIFY_HLS_DIR || "/var/lib/nexlify/hls").replace(/\/+$/, "");
/** Live HLS must be written within this window or we forward to Next (starts ffmpeg). */
const HLS_LIVE_MAX_AGE_MS = Number(process.env.NEXLIFY_HLS_LIVE_MAX_AGE_MS || 12000);
const HLS_DAEMON_PORT = Number(process.env.NEXLIFY_HLS_DAEMON_PORT || 13081);
const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
const LIVE_TS_PEEK_BYTES = 188;
const LIVE_TS_OPEN_MS = Number(process.env.IPTV_EDGE_TS_OPEN_MS || 5000);
const IPTV_EDGE_AGENT_TOKEN = (process.env.IPTV_EDGE_AGENT_TOKEN || "").trim();
const IPTV_EDGE_SERVER_ID = (process.env.IPTV_EDGE_SERVER_ID || "").trim();

function edgeCanAuthLive() {
  return Boolean(INTERNAL_SECRET || (IPTV_EDGE_AGENT_TOKEN && IPTV_EDGE_SERVER_ID));
}
/** Cache live-auth at edge so channel zaps skip panel round-trip (XUI-style local auth). */
const AUTH_CACHE_TTL_MS = Number(process.env.IPTV_EDGE_AUTH_CACHE_MS || 180_000);
const CATALOG_CACHE_MS = Number(process.env.IPTV_EDGE_CATALOG_CACHE_MS || 300_000);
const CATALOG_STALE_MS = Number(process.env.IPTV_EDGE_CATALOG_STALE_MS || 600_000);
const EDGE_DISK_HLS_WAIT_MS = Number(process.env.IPTV_EDGE_DISK_HLS_WAIT_MS || 6000);
const EDGE_HLS_SEG_WAIT_MS = Number(process.env.IPTV_EDGE_HLS_SEG_WAIT_MS || 5_000);
const MAX_EDGE_HLS_REMUX = Number(process.env.IPTV_EDGE_MAX_HLS_REMUX || 256);
const MAX_EDGE_DISK_PACK = Number(process.env.IPTV_EDGE_MAX_DISK_PACK || 256);
/** One provider pull per live channel while anyone is watching (XUI on-demand restream). */
const MAX_LIVE_FANS = Number(process.env.IPTV_EDGE_MAX_LIVE_FANS || 8000);
const LIVE_FAN_LINGER_MS = Number(process.env.IPTV_EDGE_LIVE_FAN_LINGER_MS || 12000);
/** streamId -> { proc, key, clients, prefix } — refcounted native-HLS remux */
const edgeHlsRemuxSessions = new Map();
const edgeDiskPackagers = new Map();
/** streamId -> shared MPEG-TS restream */
const liveFans = new Map();
/** Edge-local primary-bad marks (mirrors panel source-failover attempts). */
const UPSTREAM_FAIL_MAX = Number(process.env.IPTV_EDGE_UPSTREAM_FAIL_MAX || 3);
const UPSTREAM_FAIL_TTL_MS = Number(process.env.IPTV_EDGE_UPSTREAM_FAIL_TTL_MS || 300_000);
const upstreamFailMarks = new Map();
const EDGE_HLS_SEG_CACHE_MB = Number(process.env.IPTV_EDGE_HLS_SEG_CACHE_MB || 256);
const hlsSegMemCache = new Map();
const catalogCache = new Map();
const catalogInflight = new Map();
const authCache = new Map();
const PLAYBACK_RE = /^\/(live|timeshift|movie|series)\//;
const HLS_RE = /\.m3u8(?:[?#]|$)/i;
const HLS_SEG_RE = /^\/live\/([^/]+)\/([^/]+)\/([^/]+)\/hls\/(seg\d+\.ts)$/i;
const LIVE_M3U8_RE = /^\/live\/([^/]+)\/([^/]+)\/([^/]+)\.m3u8$/i;
const TIMESHIFT_RE = /^\/timeshift\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i;

function isTinyLiveRangeProbe(range) {
  const r = String(range ?? "").trim();
  if (!r) return false;
  const m = /^bytes=(\d+)-(\d+)$/i.exec(r);
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  return end - start < 65536;
}

/** Exo/Chrome can play an instant HLS wrap. Smarters/LibVLC need real HLS segments. */
function userAgentAllowsInstantTsWrap(ua) {
  const s = String(ua || "").toLowerCase();
  if (!s) return false;
  if (s.includes("smarters") || s.includes("libvlc") || s.includes("lavf") || s.includes("vlc/")) {
    return false;
  }
  if (s.includes("exoplayer") || s.includes("applecoremedia") || s.includes("cfnetwork") || s.includes("hls.js")) {
    return true;
  }
  if (s.includes("chrome/") || s.includes("firefox/") || s.includes("edg/") || s.includes("crios/")) return true;
  if (s.includes("safari/") && s.includes("version/")) return true;
  return false;
}

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

function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "0:0:0:0:0:0:0:1";
}

function isValidIpLiteral(ip) {
  if (!ip || ip.length > 45) return false;
  if (ip.includes(":") && !ip.includes(" ")) return true;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function socketIp(req) {
  let ip = req.socket.remoteAddress || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

const EDGE_INFRA_IPS = new Set(
  String(process.env.NEXLIFY_INFRA_IPS || "209.237.141.15,45.88.138.18")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
);

function stripIp(raw) {
  let ip = String(raw || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

function isInfraOrLoopbackIp(ip) {
  const n = stripIp(ip);
  if (!n || !isValidIpLiteral(n)) return true;
  if (isLoopbackIp(n)) return true;
  if (EDGE_INFRA_IPS.has(n)) return true;
  return false;
}

/**
 * Prefer the TCP peer. Only honor X-Forwarded-For when the hop is loopback,
 * explicitly listed in IPTV_EDGE_TRUST_XFF, or trust is set to always.
 * Walk hops from the nearest proxy and skip loopback/panel/edge IPs — :80
 * hairpins through 127.0.0.1:8080, which used to become the "viewer" IP.
 */
function clientIp(req) {
  const peer = socketIp(req);
  const trust = String(process.env.IPTV_EDGE_TRUST_XFF || "loopback,45.88.138.18").toLowerCase();
  const trustedPeers = new Set(
    trust
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => isValidIpLiteral(ip))
  );
  const allowXff =
    trust === "1" ||
    trust === "true" ||
    trust === "always" ||
    trustedPeers.has(peer) ||
    isLoopbackIp(peer) ||
    ((trust === "loopback" || trust === "") && isLoopbackIp(peer));
  if (allowXff) {
    const hops = [];
    for (const part of String(req.headers["x-forwarded-for"] || "").split(",")) {
      const ip = stripIp(part);
      if (isValidIpLiteral(ip)) hops.push(ip);
    }
    const real = stripIp(req.headers["x-real-ip"]);
    if (isValidIpLiteral(real)) hops.push(real);
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!isInfraOrLoopbackIp(hops[i])) return hops[i];
    }
  }
  if (!isInfraOrLoopbackIp(peer)) return peer;
  return "";
}

/** HTTP heartbeat only — must not reset lastClientAt or HLS never goes idle. */
function sendConnectionPulse(ctx, bytes) {
  if (!INTERNAL_SECRET || !ctx?.lineId || !ctx?.streamId) return;
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
      agent: liveAgent,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
        // nginx on :8080 drops underscore headers; this hyphenated alias is accepted by the panel.
        "x-panel-api-key": INTERNAL_SECRET,
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

function sendPlaybackEvent(ctx, action, detail, status) {
  if (!INTERNAL_SECRET || !ctx?.streamId) return;
  const body = JSON.stringify({
    action,
    streamId: ctx.streamId,
    lineId: ctx.lineId ?? "",
    detail: String(detail ?? "").slice(0, 300),
    status: status || undefined,
  });
  const req = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: "/api/internal/playback-event",
      method: "POST",
      agent: liveAgent,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
        // nginx on :8080 drops underscore headers; this hyphenated alias is accepted by the panel.
        "x-panel-api-key": INTERNAL_SECRET,
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

function pulseConnection(ctx, bytes) {
  touchPlaybackSession(ctx, { hls: Boolean(ctx?.hls) });
  sendConnectionPulse(ctx, bytes);
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
        agent: liveAgent,
        headers: {
          "x-panel-internal-secret": INTERNAL_SECRET,
          "x-panel-api-key": INTERNAL_SECRET,
        },
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

/** Polling every stream each second overwhelms the panel and starves live-auth. */
const KICK_POLL_MS = Math.max(
  5_000,
  Number(process.env.IPTV_EDGE_KICK_POLL_MS || 15_000)
);

/** Abort upstream/client pipes promptly without flooding the panel API. */
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
  const timer = setInterval(tick, KICK_POLL_MS);
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
      agent: liveAgent,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
        // nginx on :8080 drops underscore headers; this hyphenated alias is accepted by the panel.
        "x-panel-api-key": INTERNAL_SECRET,
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
const SESSION_KEEPALIVE_MS = Math.max(
  5_000,
  Number(process.env.IPTV_EDGE_SESSION_KEEPALIVE_MS || 15_000)
);
/** HLS playlist polls stop when the app exits — close the panel row quickly. */
const SESSION_IDLE_MS = Number(process.env.IPTV_EDGE_SESSION_IDLE_MS || 120_000);

function playbackSessionKey(ctx) {
  return `${ctx.lineId}|${ctx.ip ?? ""}|${ctx.streamId}`;
}

function stopOtherPlaybackSessions(ctx) {
  const prefix = `${ctx.lineId}|${ctx.ip ?? ""}|`;
  const myKey = playbackSessionKey(ctx);
  for (const [key, session] of [...playbackSessions.entries()]) {
    if (!key.startsWith(prefix) || key === myKey) continue;
    if (typeof session.teardown === "function") {
      try {
        session.teardown();
      } catch {
        /* ignore */
      }
    }
    endPlaybackSession(session.ctx);
    clearInterval(session.timer);
    playbackSessions.delete(key);
  }
}

function touchPlaybackSession(ctx, opts = {}) {
  if (!ctx?.lineId || !ctx?.streamId) return;
  stopOtherPlaybackSessions(ctx);
  const key = playbackSessionKey(ctx);
  const now = Date.now();
  let session = playbackSessions.get(key);
  if (!session) {
    session = { ctx, lastClientAt: now, teardown: null, hls: Boolean(opts.hls || ctx.hls) };
    const tickMs = SESSION_KEEPALIVE_MS;
    session.timer = setInterval(() => {
      const idle = Date.now() - session.lastClientAt;
      if (idle > SESSION_IDLE_MS) {
        clearInterval(session.timer);
        playbackSessions.delete(key);
        if (typeof session.teardown === "function") {
          try {
            session.teardown();
          } catch {
            /* ignore */
          }
        }
        endPlaybackSession(session.ctx);
        return;
      }
      sendConnectionPulse(session.ctx, 48_000);
    }, tickMs);
    playbackSessions.set(key, session);
    pulseConnection(ctx, 72_000);
    return;
  }
  if (opts.hls || ctx.hls) session.hls = true;
  session.lastClientAt = now;
}

function registerPipeTeardown(pulseCtx, fn) {
  if (!pulseCtx?.lineId || !pulseCtx?.streamId || typeof fn !== "function") return;
  const session = playbackSessions.get(playbackSessionKey(pulseCtx));
  if (session) session.teardown = fn;
}

function markPlaybackSessionActive(pulseCtx, now = Date.now()) {
  if (!pulseCtx?.lineId || !pulseCtx?.streamId) return;
  const session = playbackSessions.get(playbackSessionKey(pulseCtx));
  if (session) session.lastClientAt = now;
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
    markPlaybackSessionActive(pulseCtx, now);
    if (lastPulse === 0) lastPulse = now;
    // Aggregate bytes locally. A bitrate-based threshold generated several DB
    // writes per second per viewer and made the panel unavailable.
    if (now - lastPulse >= SESSION_KEEPALIVE_MS) {
      pulseConnection(pulseCtx, pending);
      pending = 0;
      lastPulse = now;
    }
  };
}

function parseAltsHeader(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((part) => {
      try {
        return decodeURIComponent(part.trim());
      } catch {
        return "";
      }
    })
    .filter((u) => /^https?:\/\//i.test(u));
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

/** XUI LB: remote edge already egresses from the stream-server IP — never loop via local tinyproxy. */
function effectiveOutboundProxy(proxy) {
  if (!proxy) return null;
  if (process.env.IPTV_EDGE_REMOTE_NODE === "1") return null;
  const local = new Set(
    ["127.0.0.1", "localhost", "::1", "0.0.0.0"]
      .concat(String(process.env.IPTV_EDGE_LOCAL_HOST || "").split(/[,\s]+/))
      .filter(Boolean)
  );
  if (local.has(String(proxy.host || "").toLowerCase())) return null;
  return proxy;
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

function proxyToHttpProxyUrl(proxy) {
  if (!proxy?.host) return "";
  const auth =
    proxy.username || proxy.password
      ? `${encodeURIComponent(proxy.username || "")}:${encodeURIComponent(proxy.password || "")}@`
      : "";
  return `http://${auth}${proxy.host}:${proxy.port || 80}`;
}

/** Fix XUI/import typos like "://host:/path" before piping upstream (matches panel stream-source.ts). */
function repairMalformedStreamUrl(input) {
  let s = String(input ?? "").trim();
  if (!s) return s;
  if (s.startsWith("://")) s = `https${s}`;
  s = s.replace(/^(https?):\/\/([^:/]+):\//i, "$1://$2/");
  s = s.replace(/^(https?):\/\/([^:/]+):(\d+)\/(.*)$/i, (_, scheme, host, port, rest) => {
    if (port === "443" && scheme.toLowerCase() === "https") return `https://${host}/${rest}`;
    if (port === "80" && scheme.toLowerCase() === "http") return `http://${host}/${rest}`;
    return `${scheme}://${host}:${port}/${rest}`;
  });
  return s;
}

function normalizeUpstreamUrl(url) {
  const repaired = repairMalformedStreamUrl(url);
  try {
    const u = new URL(repaired);
    if (u.protocol === "https:" && u.port === "443") u.port = "";
    if (u.protocol === "http:" && u.port === "80") u.port = "";
    return u.toString();
  } catch {
    return repaired;
  }
}

function upstreamFailKey(streamId, url) {
  return `${streamId || "na"}|${normalizeUpstreamUrl(url)}`;
}

function markUpstreamFailed(streamId, url) {
  if (!url) return;
  const key = upstreamFailKey(streamId, url);
  const hit = upstreamFailMarks.get(key);
  upstreamFailMarks.set(key, { n: (hit?.n ?? 0) + 1, at: Date.now() });
}

function clearUpstreamFailure(streamId, url) {
  if (!url) return;
  upstreamFailMarks.delete(upstreamFailKey(streamId, url));
}

function isUpstreamKnownBad(streamId, url) {
  if (!url) return false;
  const key = upstreamFailKey(streamId, url);
  const hit = upstreamFailMarks.get(key);
  if (!hit) return false;
  if (Date.now() - hit.at > UPSTREAM_FAIL_TTL_MS) {
    upstreamFailMarks.delete(key);
    return false;
  }
  return hit.n >= UPSTREAM_FAIL_MAX;
}

/** Prefer a healthy backup when the primary URL is marked bad at the edge. */
function orderLiveUpstreamTargets(streamId, primary, alts) {
  const backups = (Array.isArray(alts) ? alts : []).filter(Boolean);
  if (!isUpstreamKnownBad(streamId, primary)) {
    return { upstream: primary, failovers: backups };
  }
  const healthy = backups.filter((u) => !isUpstreamKnownBad(streamId, u));
  if (!healthy.length) return { upstream: primary, failovers: backups };
  const preferred = healthy[0];
  const rest = [primary, ...backups.filter((u) => u !== preferred)];
  return { upstream: preferred, failovers: rest };
}

/** Map live upstream → provider timeshift container (panel timeshift-url.ts). */
function xtreamTimeshiftSourceUrl(liveUrl, durationMinutes, start) {
  try {
    const u = new URL(normalizeUpstreamUrl(liveUrl));
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const duration = Math.max(1, Math.min(Number(durationMinutes) || 1, 24 * 60));
    const startSeg = /^[0-9A-Za-z:_-]+$/.test(start) ? start : encodeURIComponent(String(start).replace(/\\/g, ""));
    const path = u.pathname.replace(/\/+$/, "");
    const live = path.match(/^(.*)\/live\/([^/]+)\/([^/]+)\/([^/]+?)(\.ts)?$/i);
    if (live) {
      const ext = live[5] || ".ts";
      u.pathname = `${live[1]}/timeshift/${live[2]}/${live[3]}/${duration}/${startSeg}/${live[4]}${ext}`;
      return u.toString();
    }
    const xt = path.match(/^(.*)\/([^/]+)\/([^/]+)\/(\d+)(\.ts)?$/i);
    if (xt) {
      const ext = xt[5] || ".ts";
      u.pathname = `${xt[1]}/timeshift/${xt[2]}/${xt[3]}/${duration}/${startSeg}/${xt[4]}${ext}`;
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

async function authTimeshiftViaLive(clientReq) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  const m = pathOnly.match(TIMESHIFT_RE);
  if (!m) return null;
  const qs = String(clientReq.url || "").includes("?") ? `?${String(clientReq.url).split("?")[1]}` : "";
  const liveReq = { ...clientReq, url: `/live/${m[1]}/${m[2]}/${m[5]}${qs}` };
  const liveAuth = await authLiveCached(liveReq);
  if (liveAuth.status !== 200 || !liveAuth.upstream || liveAuth.passthrough) return liveAuth;
  const tsUrl = xtreamTimeshiftSourceUrl(liveAuth.upstream, Number(m[3]), m[4]);
  if (!tsUrl) return liveAuth;
  return { ...liveAuth, upstream: tsUrl, live: true, passthrough: false };
}

function sanitizeAuthUpstream(data) {
  if (!data?.upstream) return data;
  const upstream = normalizeUpstreamUrl(data.upstream);
  const alts = (data.alts || [])
    .map((u) => normalizeUpstreamUrl(u))
    .filter((u) => {
      try {
        const p = new URL(u);
        return p.protocol === "http:" || p.protocol === "https:";
      } catch {
        return false;
      }
    });
  return { ...data, upstream, alts };
}

function looksLikeMpegTs(buf) {
  if (!buf?.length || buf[0] !== 0x47) return false;
  if (buf.length >= 376 && buf[188] === 0x47) return true;
  return buf.length >= 188;
}

function isHlsPlaybackUrl(url) {
  return /\.m3u8([?#]|$)/i.test(String(url || "").trim());
}

function resolveFfmpegPath() {
  const env = process.env.NEXLIFY_FFMPEG_PATH || process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    "/home/nexlify/bin/ffmpeg_bin/8.0/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg";
}

function destroyLiveFan(fan) {
  if (!fan || fan.destroyed) return;
  fan.destroyed = true;
  if (fan.linger) {
    clearTimeout(fan.linger);
    fan.linger = null;
  }
  liveFans.delete(fan.streamId);
  for (const w of fan.waiters.splice(0, fan.waiters.length)) {
    try {
      if (!w.clientRes.headersSent) {
        w.clientRes.writeHead(502, { "content-type": "text/plain" });
      }
      if (!w.clientRes.writableEnded) w.clientRes.end();
    } catch {
      /* ignore */
    }
  }
  for (const slot of [...fan.clients]) detachLiveFanClient(fan, slot, { closingFan: true });
  try {
    fan.destroySrc?.();
  } catch {
    /* ignore */
  }
}

function detachLiveFanClient(fan, slot, opts) {
  if (!fan.clients.has(slot)) return;
  fan.clients.delete(slot);
  try {
    slot.stopKick?.();
  } catch {
    /* ignore */
  }
  endPlaybackSession(slot.pulseCtx);
  try {
    if (!slot.clientRes.writableEnded) slot.clientRes.end();
  } catch {
    /* ignore */
  }
  if (opts?.closingFan) return;
  if (fan.clients.size === 0 && fan.waiters.length === 0) {
    if (fan.linger) clearTimeout(fan.linger);
    fan.linger = setTimeout(() => destroyLiveFan(fan), LIVE_FAN_LINGER_MS);
  }
}

function attachLiveFanClient(fan, clientReq, clientRes, pulseCtx) {
  if (fan.linger) {
    clearTimeout(fan.linger);
    fan.linger = null;
  }
  if (!clientRes.headersSent) {
    writeLiveTsHead(clientRes);
    if (fan.prefix && fan.prefix.length) {
      try {
        // The fan keeps a rolling byte tail, which may begin mid-packet.
        // Start every newly joined client on an MPEG-TS sync byte.
        let aligned = fan.prefix;
        for (let i = 0; i < Math.min(188, fan.prefix.length); i++) {
          if (
            fan.prefix[i] === 0x47 &&
            fan.prefix[i + 188] === 0x47 &&
            fan.prefix[i + 376] === 0x47
          ) {
            aligned = fan.prefix.subarray(i);
            break;
          }
        }
        clientRes.write(aligned);
      } catch {
        /* ignore */
      }
    }
  }
  const slot = {
    clientReq,
    clientRes,
    pulseCtx,
    stopKick: () => undefined,
    meter: pulseCtx ? createLiveByteMeter(pulseCtx) : null,
  };
  const drop = () => detachLiveFanClient(fan, slot);
  slot.stopKick = watchSessionKick(pulseCtx, drop);
  registerPipeTeardown(pulseCtx, drop);
  clientReq.once("close", drop);
  clientReq.once("aborted", drop);
  fan.clients.add(slot);
}

function broadcastFanChunk(fan, chunk) {
  if (!chunk || !chunk.length) return;
  const keep = 188 * 24;
  if (!fan.prefix || !fan.prefix.length) {
    fan.prefix = chunk.length <= keep ? chunk : chunk.subarray(chunk.length - keep);
  } else {
    const next = Buffer.concat([fan.prefix, chunk]);
    fan.prefix = next.length <= keep ? next : next.subarray(next.length - keep);
  }
  for (const slot of [...fan.clients]) {
    try {
      if (slot.meter) slot.meter(chunk);
      slot.clientRes.write(chunk);
    } catch {
      detachLiveFanClient(fan, slot);
    }
  }
}

function tryJoinLiveFan(streamId, clientReq, clientRes, pulseCtx) {
  if (!streamId) return false;
  const fan = liveFans.get(streamId);
  if (!fan?.broadcasting) return false;
  if (!fan.destroySrc && !fan.prefix?.length && fan.clients.size === 0 && fan.waiters.length === 0) {
    destroyLiveFan(fan);
    return false;
  }
  attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
  return true;
}

/** One upstream pull per streamId — extra viewers attach to the same fan. */
function ensureLiveFan(streamId) {
  if (!streamId) return null;
  let fan = liveFans.get(streamId);
  if (fan) return fan;
  if (liveFans.size >= MAX_LIVE_FANS) return null;
  fan = {
    streamId,
    broadcasting: false,
    waiters: [],
    clients: new Set(),
    destroySrc: null,
    starterLock: false,
    prefix: Buffer.alloc(0),
    linger: null,
    destroyed: false,
  };
  liveFans.set(streamId, fan);
  return fan;
}

function fanGoLive(fan, destroySrc) {
  fan.destroySrc = destroySrc;
  fan.broadcasting = true;
  fan.starterLock = false;
  const pending = fan.waiters.splice(0, fan.waiters.length);
  for (const w of pending) attachLiveFanClient(fan, w.clientReq, w.clientRes, w.pulseCtx);
}

function rejectFanWaiters(fan, msg) {
  for (const w of fan.waiters.splice(0, fan.waiters.length)) {
    try {
      if (!w.clientRes.headersSent) {
        w.clientRes.writeHead(502, { "content-type": "text/plain" });
        w.clientRes.end(msg);
      } else if (!w.clientRes.writableEnded) {
        w.clientRes.end();
      }
    } catch {
      /* ignore */
    }
  }
}

/** Mutex: only one upstream starter per stream key; concurrent zaps wait on the fan. */
function acquireLiveFanStarter(streamId) {
  const fan = ensureLiveFan(streamId);
  if (!fan) return { fan: null, mode: "none" };
  if (fan.broadcasting) return { fan, mode: "join" };
  if (fan.starterLock) return { fan, mode: "wait" };
  fan.starterLock = true;
  return { fan, mode: "start" };
}

function releaseLiveFanStarter(fan, ok) {
  if (!fan?.starterLock) return;
  fan.starterLock = false;
  if (!ok) rejectFanWaiters(fan, "upstream failed");
}

function queueLiveFanWaiter(fan, clientReq, clientRes, pulseCtx) {
  const entry = { clientReq, clientRes, pulseCtx };
  const drop = () => {
    const i = fan.waiters.indexOf(entry);
    if (i >= 0) fan.waiters.splice(i, 1);
  };
  clientReq.once("close", drop);
  clientReq.once("aborted", drop);
  fan.waiters.push(entry);
}

function stopEdgeHlsRemuxSession(session) {
  if (!session) return;
  edgeHlsRemuxSessions.delete(session.key);
  for (const slot of [...session.clients]) detachHlsRemuxClient(session, slot, { closing: true });
  try {
    session.proc?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

function detachHlsRemuxClient(session, slot, opts) {
  if (!session.clients.has(slot)) return;
  session.clients.delete(slot);
  try {
    slot.stopKick?.();
  } catch {
    /* ignore */
  }
  endPlaybackSession(slot.pulseCtx);
  try {
    if (!slot.clientRes.writableEnded) slot.clientRes.end();
  } catch {
    /* ignore */
  }
  if (!opts?.closing && session.clients.size === 0) stopEdgeHlsRemuxSession(session);
}

function attachHlsRemuxClient(session, clientReq, clientRes, pulseCtx) {
  if (!clientRes.headersSent) {
    writeLiveTsHead(clientRes);
    if (session.prefix?.length) {
      try {
        clientRes.write(session.prefix);
      } catch {
        /* ignore */
      }
    }
  }
  const slot = {
    clientReq,
    clientRes,
    pulseCtx,
    stopKick: () => undefined,
    meter: pulseCtx ? createLiveByteMeter(pulseCtx) : null,
  };
  const drop = () => detachHlsRemuxClient(session, slot);
  slot.stopKick = watchSessionKick(pulseCtx, drop);
  registerPipeTeardown(pulseCtx, drop);
  clientReq.once("close", drop);
  clientReq.once("aborted", drop);
  session.clients.add(slot);
}

function broadcastHlsRemuxChunk(session, chunk) {
  if (!chunk?.length) return;
  const keep = 188 * 24;
  if (!session.prefix?.length) {
    session.prefix = chunk.length <= keep ? chunk : chunk.subarray(chunk.length - keep);
  } else {
    const next = Buffer.concat([session.prefix, chunk]);
    session.prefix = next.length <= keep ? next : next.subarray(next.length - keep);
  }
  for (const slot of [...session.clients]) {
    try {
      if (slot.meter) slot.meter(chunk);
      slot.clientRes.write(chunk);
    } catch {
      detachHlsRemuxClient(session, slot);
    }
  }
}

/**
 * Remux provider HLS → MPEG-TS at the edge (never through Next.js workers).
 * XUI-style: one ffmpeg per channel; extra viewers join the same pipe.
 */
function spawnEdgeHlsToMpegTs(hlsUrl, clientReq, clientRes, pulseCtx) {
  const key = pulseCtx?.streamId || hlsUrl;
  let session = edgeHlsRemuxSessions.get(key);
  if (session?.proc && session.proc.exitCode == null && !session.proc.killed) {
    attachHlsRemuxClient(session, clientReq, clientRes, pulseCtx);
    return;
  }
  if (session) stopEdgeHlsRemuxSession(session);
  if (edgeHlsRemuxSessions.size >= MAX_EDGE_HLS_REMUX) {
    const oldest = edgeHlsRemuxSessions.keys().next().value;
    if (oldest) stopEdgeHlsRemuxSession(edgeHlsRemuxSessions.get(oldest));
  }

  const ffmpegPath = resolveFfmpegPath();
  const ua = String(clientReq.headers["user-agent"] || UPSTREAM_UA);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+nobuffer+discardcorrupt",
    "-flags",
    "low_delay",
    "-probesize",
    "32768",
    "-analyzeduration",
    "100000",
    "-user_agent",
    ua,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-i",
    hlsUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-flush_packets",
    "1",
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-mpegts_flags",
    "+resend_headers",
    "-f",
    "mpegts",
    "pipe:1",
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (!proc.stdout) {
    proc.kill();
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end("ffmpeg remux failed");
    }
    return;
  }
  session = {
    key,
    proc,
    clients: new Set(),
    prefix: Buffer.alloc(0),
  };
  edgeHlsRemuxSessions.set(key, session);

  proc.stderr?.on("data", () => undefined);
  proc.on("error", () => {
    stopEdgeHlsRemuxSession(session);
  });
  proc.on("close", () => {
    if (edgeHlsRemuxSessions.get(key) === session) stopEdgeHlsRemuxSession(session);
  });
  proc.stdout.on("data", (chunk) => broadcastHlsRemuxChunk(session, chunk));
  attachHlsRemuxClient(session, clientReq, clientRes, pulseCtx);
}

function stopEdgeDiskPackager(streamId) {
  const proc = edgeDiskPackagers.get(streamId);
  if (!proc) return;
  try {
    proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  edgeDiskPackagers.delete(streamId);
}

/** XUI-style: ffmpeg writes HLS segments on disk at edge — XCIPTV/Smarters never hit Next.js for .m3u8. */
function startEdgeDiskPackager(streamId, upstreamUrl, ua, proxy) {
  if (!streamId || !upstreamUrl) return;
  const running = edgeDiskPackagers.get(streamId);
  if (running && running.exitCode == null && !running.killed) return;
  if (running) stopEdgeDiskPackager(streamId);
  if (edgeDiskPackagers.size >= MAX_EDGE_DISK_PACK) {
    const oldest = edgeDiskPackagers.keys().next().value;
    if (oldest) stopEdgeDiskPackager(oldest);
  }
  const dir = hlsStreamDir(streamId);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const segPattern = path.join(dir, "seg%d.ts");
  const indexPath = path.join(dir, "index.m3u8");
  const ffmpegPath = resolveFfmpegPath();
  const httpProxy = proxyToHttpProxyUrl(proxy);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+nobuffer+discardcorrupt",
    "-flags",
    "low_delay",
    "-probesize",
    "524288",
    "-analyzeduration",
    "1500000",
    "-user_agent",
    String(ua || UPSTREAM_UA),
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    ...(httpProxy ? ["-http_proxy", httpProxy] : []),
    "-i",
    upstreamUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "12",
    "-hls_delete_threshold",
    "30",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist",
    "-hls_segment_filename",
    segPattern,
    indexPath,
  ];
  const proc = spawn(ffmpegPath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  edgeDiskPackagers.set(streamId, proc);
  proc.stderr?.on("data", (chunk) => {
    const msg = String(chunk || "").trim();
    if (msg && !msg.includes("frame=")) {
      console.warn(`[iptv-edge] hls-pack ${streamId.slice(0, 12)}: ${msg.slice(0, 200)}`);
    }
  });
  proc.on("close", () => {
    if (edgeDiskPackagers.get(streamId) === proc) edgeDiskPackagers.delete(streamId);
  });
}

function pruneCatalogCache(now) {
  if (catalogCache.size <= 512) return;
  for (const [key, hit] of catalogCache) {
    if (hit.expires <= now) catalogCache.delete(key);
  }
  while (catalogCache.size > 1024) {
    const oldest = catalogCache.keys().next().value;
    if (!oldest) break;
    catalogCache.delete(oldest);
  }
}

function catalogActionCacheable(url) {
  const q = String(url || "").split("?")[1] || "";
  if (!q) return false;
  const m = /(?:^|&)action=([^&]+)/i.exec(q);
  // Xtream login (username/password, no action) must not wait on catalog cache/build.
  if (!m) return false;
  const action = decodeURIComponent(m[1]).toLowerCase();
  return /^(get_live_categories|get_vod_categories|get_series_categories|get_live_streams)$/.test(
    action
  );
}

function catalogCacheKey(url) {
  return String(url || "/").split("#")[0];
}

function catalogResponseHeaders(hdrs, fromCache) {
  const out = { ...hdrs };
  delete out["transfer-encoding"];
  if (fromCache) {
    out["x-nexlify-edge-catalog"] = "hit";
    out["cache-control"] = "private, max-age=300";
  }
  return out;
}

function storeCatalogCache(key, now, status, hdrs, body) {
  if (status !== 200 || !body?.length) return;
  catalogCache.set(key, {
    expires: now + CATALOG_CACHE_MS,
    staleUntil: now + CATALOG_STALE_MS,
    status,
    headers: hdrs,
    body,
  });
  pruneCatalogCache(now);
}

function fetchCatalogFromPanel(url, clientReq, ctx, onDone) {
  const cleanHost = sanitizeHostHeader(clientReq.headers.host) || backendHost;
  const headers = { ...clientReq.headers };
  headers.host = cleanHost;
  headers["x-forwarded-host"] = cleanHost.split(":")[0];
  headers["x-forwarded-proto"] = ctx.proto;
  headers["x-forwarded-port"] = String(ctx.listenPort);
  headers["x-nexlify-client-port"] = String(ctx.listenPort);
  headers["x-forwarded-for"] = clientIp(clientReq);

  return new Promise((resolve) => {
    const proxyReq = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: url,
        method: "GET",
        agent: apiAgent,
        headers,
        timeout: 45_000,
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks);
          const hdrs = { ...proxyRes.headers };
          const status = proxyRes.statusCode || 502;
          const now = Date.now();
          const cacheKey = catalogCacheKey(url);
          storeCatalogCache(cacheKey, now, status, hdrs, body);
          onDone?.({ status, headers: hdrs, body });
          resolve({ status, headers: hdrs, body });
        });
      }
    );
    proxyReq.on("error", () => {
      const err = { status: 502, headers: { "content-type": "text/plain" }, body: Buffer.from("iptv-edge catalog error") };
      onDone?.(err);
      resolve(err);
    });
    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      const err = { status: 504, headers: { "content-type": "text/plain" }, body: Buffer.from("catalog timeout") };
      onDone?.(err);
      resolve(err);
    });
    proxyReq.end();
  });
}

function refreshCatalogInBackground(key, url, clientReq, ctx) {
  if (catalogInflight.has(key)) return;
  const p = fetchCatalogFromPanel(url, clientReq, ctx).finally(() => catalogInflight.delete(key));
  catalogInflight.set(key, p);
}

function forwardCatalogCached(clientReq, clientRes, ctx) {
  const method = String(clientReq.method || "GET").toUpperCase();
  const url = clientReq.url || "/";
  if (method !== "GET" || !catalogActionCacheable(url)) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  const key = catalogCacheKey(url);
  const now = Date.now();
  const hit = catalogCache.get(key);
  if (hit && hit.expires > now) {
    clientRes.writeHead(hit.status, catalogResponseHeaders(hit.headers, true));
    clientRes.end(hit.body);
    return;
  }
  if (hit && hit.staleUntil > now) {
    clientRes.writeHead(hit.status, catalogResponseHeaders(hit.headers, true));
    clientRes.end(hit.body);
    refreshCatalogInBackground(key, url, clientReq, ctx);
    return;
  }

  fetchCatalogFromPanel(url, clientReq, ctx, (res) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(res.status, catalogResponseHeaders(res.headers, false));
      clientRes.end(res.body);
    }
  });
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

function writeLiveTsHead(clientRes) {
  if (!clientRes.headersSent) {
    clientRes.writeHead(200, liveTsHeaders());
  }
  const sock = clientRes.socket;
  if (!sock) return;
  try {
    sock.setNoDelay(true);
  } catch {
    /* ignore */
  }
  try {
    sock.setKeepAlive(true, 20_000);
  } catch {
    /* ignore */
  }
}

function headerStr(headers, key) {
  const v = headers?.[key];
  if (Array.isArray(v)) return v[0] ? String(v[0]) : "";
  return v ? String(v) : "";
}

/** Copy only media headers — hop-by-hop / Set-Cookie / Location leak the provider. */
function vodClientHeaders(upHeaders) {
  const headers = {
    "Content-Type": headerStr(upHeaders, "content-type") || "video/mp4",
    "Cache-Control": "private, no-cache, no-store",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": headerStr(upHeaders, "accept-ranges") || "bytes",
  };
  const len = headerStr(upHeaders, "content-length");
  if (len) headers["Content-Length"] = len;
  const cr = headerStr(upHeaders, "content-range");
  if (cr) headers["Content-Range"] = cr;
  const lm = headerStr(upHeaders, "last-modified");
  if (lm) headers["Last-Modified"] = lm;
  const et = headerStr(upHeaders, "etag");
  if (et) headers["ETag"] = et;
  return headers;
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

function backendRetryDelay(attempt) {
  return Math.min(BACKEND_RETRY_MS * 1.5 ** Math.max(0, attempt - 1), 4000);
}

function backendRetryBudgetLeft(startedAt) {
  return Date.now() - startedAt < BACKEND_RETRY_BUDGET_MS;
}

function probeBackendHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: "/api/health",
        method: "GET",
        agent: adminAgent,
        timeout: 4000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
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

async function waitForBackendReady() {
  const start = Date.now();
  while (Date.now() - start < BACKEND_STARTUP_WAIT_MS) {
    if (await probeBackendHealth()) {
      console.log(`[iptv-edge] backend ${BACKEND} ready`);
      return true;
    }
    console.log(`[iptv-edge] waiting for backend ${BACKEND}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.error(
    `[iptv-edge] WARN: backend ${BACKEND} not ready after ${BACKEND_STARTUP_WAIT_MS}ms — listening anyway (requests will retry up to ${BACKEND_RETRY_BUDGET_MS}ms)`
  );
  return false;
}

function forward(clientReq, clientRes, { listenPort, proto }) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  // nginx on the panel proxies /live/ back to this edge. Never bounce media to
  // IPTV_EDGE_BACKEND or we 502-loop and players hang.
  if (/^\/(live|timeshift|movie|series)\//i.test(pathOnly)) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain", connection: "close" });
    }
    try {
      clientRes.end("edge: media must splice locally");
    } catch {
      /* ignore */
    }
    return;
  }
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
  const retryStarted = Date.now();

  function sendToBackend() {
    attempt++;
    const proxyReq = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: clientReq.url,
        method: clientReq.method,
        agent: backendAgentFor(clientReq.url),
        headers,
        timeout: isAdminUiPath(clientReq.url) ? 60_000 : 300_000,
      },
      (proxyRes) => {
        const hdrs = { ...proxyRes.headers };
        delete hdrs["vary"];
        delete hdrs["x-frame-options"];
        delete hdrs["x-content-type-options"];
        delete hdrs["referrer-policy"];
        delete hdrs["permissions-policy"];
        const pathOnly = String(clientReq.url || "/").split("?")[0];
        if (/\/xmltv\.php$/i.test(pathOnly) && !hdrs["content-type"]) {
          const gzipFile = /[?&]type=(gzip|gz)\b/i.test(String(clientReq.url || ""));
          hdrs["content-type"] = gzipFile ? "application/gzip" : "text/xml; charset=utf-8";
        }
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
        backendRetryBudgetLeft(retryStarted) &&
        isBackendRetryable(err)
      ) {
        setTimeout(sendToBackend, backendRetryDelay(attempt));
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "content-type": "text/plain" });
      }
      clientRes.end("iptv-edge proxy error");
    });
    if (hasBody) clientReq.pipe(proxyReq);
    else proxyReq.end();
  }

  sendToBackend();
}

function authCacheKey(clientReq) {
  const ua = String(clientReq.headers["user-agent"] || "")
    .slice(0, 96)
    .toLowerCase();
  let urlPath = (clientReq.url || "/").split("?")[0];
  const method = String(clientReq.method || "GET").toUpperCase();
  // HLS segments share auth with the parent playlist — avoid per-seg panel round-trips.
  const segMatch = urlPath.match(/^(\/live\/[^/]+\/[^/]+\/\d+)\/hls\/seg\d+\.ts$/i);
  if (segMatch) urlPath = `${segMatch[1]}.m3u8`;
  const methodKey = segMatch ? "GET" : method;
  return `${clientIp(clientReq)}:${methodKey}:${urlPath}:${ua}`;
}

function authLive(clientReq) {
  return new Promise((resolve, reject) => {
    const useAgentAuth = Boolean(IPTV_EDGE_AGENT_TOKEN && IPTV_EDGE_SERVER_ID);
    const headers = {
      "x-original-uri": clientReq.url || "/",
      "x-original-method": clientReq.method || "GET",
      "x-original-range": String(clientReq.headers.range || ""),
      "x-forwarded-for": clientIp(clientReq),
      "x-real-ip": clientIp(clientReq),
      "x-nexlify-client-ip": clientIp(clientReq),
      "x-nexlify-viewer-ip": clientIp(clientReq),
      "user-agent": clientReq.headers["user-agent"] || "",
      connection: "close",
    };
    if (useAgentAuth) {
      headers.authorization = `Bearer ${IPTV_EDGE_AGENT_TOKEN}`;
      headers["x-nexlify-agent-server-id"] = IPTV_EDGE_SERVER_ID;
    } else {
      headers["x-panel-internal-secret"] = INTERNAL_SECRET;
    }
    let attempt = 0;
    const retryStarted = Date.now();

    function go() {
      attempt++;
      if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
        console.log(
          `[iptv-edge-auth-req] uri=${JSON.stringify(headers["x-original-uri"])} method=${headers["x-original-method"]} ip=${headers["x-forwarded-for"]} agent=${useAgentAuth}`
        );
      }
      const req = http.request(
        {
          hostname: backendHost,
          port: backendPort,
          path: "/api/internal/live-auth",
          method: "GET",
          agent: liveAgent,
          headers,
          timeout: 8_000,
        },
        (res) => {
          res.resume();
          resolve({
            status: res.statusCode || 502,
            upstream: String(res.headers["x-nexlify-upstream"] || ""),
            alts: parseAltsHeader(res.headers["x-nexlify-alts"]),
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
        if (
          attempt < BACKEND_RETRY_MAX &&
          backendRetryBudgetLeft(retryStarted) &&
          isBackendRetryable(err)
        ) {
          setTimeout(go, backendRetryDelay(attempt));
          return;
        }
        reject(err);
      });
      req.end();
    }

    go();
  });
}

function pruneAuthCache(now) {
  if (authCache.size <= 2048) return;
  for (const [key, hit] of authCache) {
    if (hit.expires <= now) authCache.delete(key);
  }
  while (authCache.size > 4096) {
    const oldest = authCache.keys().next().value;
    if (!oldest) break;
    authCache.delete(oldest);
  }
}

async function authLiveCached(clientReq) {
  const key = authCacheKey(clientReq);
  const now = Date.now();
  const hit = authCache.get(key);
  if (hit && hit.expires > now && hit.data?.upstream) {
    touchHlsDaemon(hit.data.streamId);
    return sanitizeAuthUpstream(hit.data);
  }
  if (edgeRedisEnabled()) {
    const redisHit = await edgeRedisGetAuth(key);
    if (redisHit?.upstream) {
      const clean = sanitizeAuthUpstream(redisHit);
      authCache.set(key, { expires: now + AUTH_CACHE_TTL_MS, data: clean });
      if (clean.streamId) touchHlsDaemon(clean.streamId);
      return clean;
    }
  }
  const data = sanitizeAuthUpstream(await authLive(clientReq));
  if (data.status === 200 && data.upstream) {
    authCache.set(key, { expires: now + AUTH_CACHE_TTL_MS, data });
    if (edgeRedisEnabled()) {
      void edgeRedisSetAuth(key, data, AUTH_CACHE_TTL_MS);
    }
    pruneAuthCache(now);
    if (data.streamId) touchHlsDaemon(data.streamId);
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
    if (!segs?.length) return false;
    const last = segs[segs.length - 1];
    const segPath = path.join(dir, last);
    if (!fs.existsSync(segPath) || fs.statSync(segPath).size < 188) return false;
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

function pruneHlsSegMemCache() {
  const maxBytes = EDGE_HLS_SEG_CACHE_MB * 1024 * 1024;
  let total = 0;
  for (const v of hlsSegMemCache.values()) total += v.buf.length;
  while (total > maxBytes && hlsSegMemCache.size) {
    const oldest = hlsSegMemCache.keys().next().value;
    if (!oldest) break;
    const entry = hlsSegMemCache.get(oldest);
    if (entry) total -= entry.buf.length;
    hlsSegMemCache.delete(oldest);
  }
}

async function serveHlsSegment(streamId, segName, clientRes, pulseCtx) {
  const cacheKey = `${streamId}:${segName}`;
  const mem = hlsSegMemCache.get(cacheKey);
  if (mem?.buf?.length) {
    if (pulseCtx) pulseConnection(pulseCtx, mem.buf.length);
    clientRes.writeHead(200, hlsSegHeaders(mem.buf.length));
    clientRes.end(mem.buf);
    return true;
  }
  if (edgeRedisEnabled()) {
    const redisBuf = await edgeRedisGetSeg(streamId, segName);
    if (redisBuf?.length) {
      hlsSegMemCache.set(cacheKey, { buf: redisBuf, at: Date.now() });
      pruneHlsSegMemCache();
      if (pulseCtx) pulseConnection(pulseCtx, redisBuf.length);
      clientRes.writeHead(200, hlsSegHeaders(redisBuf.length));
      clientRes.end(redisBuf);
      return true;
    }
  }
  const segPath = hlsSegPath(streamId, segName);
  if (!segPath) return false;
  try {
    if (!fs.existsSync(segPath)) return false;
    const buf = fs.readFileSync(segPath);
    if (!buf.length) return false;
    hlsSegMemCache.set(cacheKey, { buf, at: Date.now() });
    pruneHlsSegMemCache();
    if (edgeRedisEnabled()) void edgeRedisSetSeg(streamId, segName, buf);
    if (pulseCtx) pulseConnection(pulseCtx, buf.length);
    clientRes.writeHead(200, hlsSegHeaders(buf.length));
    clientRes.end(buf);
    return true;
  } catch {
    return false;
  }
}

/** Fetch ~2MB MPEG-TS from upstream (follows redirects; respects outbound proxy). */
function fetchUpstreamTsBuffer(upstreamUrl, ua, proxy, maxBytes = 2_000_000, redirectsLeft = 5) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(normalizeUpstreamUrl(upstreamUrl));
    } catch {
      resolve(null);
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      resolve(null);
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
      method: "GET",
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        "User-Agent": String(ua || UPSTREAM_UA),
        Accept: "*/*",
        Connection: "keep-alive",
        Host: parsed.host,
      },
      timeout: 15_000,
    };
    if (parsed.protocol === "https:") reqOpts.rejectUnauthorized = false;
    if (proxy) {
      reqOpts.createConnection = (_opts, cb) => {
        connectOriginSocket(parsed.toString(), proxy, 30_000)
          .then((socket) => cb(null, socket))
          .catch((err) => cb(err, undefined));
      };
    } else {
      reqOpts.agent = parsed.protocol === "https:" ? upstreamLiveHttpsAgent : upstreamLiveHttpAgent;
    }
    const req = lib.request(reqOpts, (upRes) => {
      const status = upRes.statusCode || 0;
      const loc = upRes.headers.location;
      if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
        upRes.resume();
        let next;
        try {
          next = new URL(loc, parsed).toString();
        } catch {
          resolve(null);
          return;
        }
        fetchUpstreamTsBuffer(next, ua, proxy, maxBytes, redirectsLeft - 1).then(resolve);
        return;
      }
      if (status >= 400) {
        upRes.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      let total = 0;
      let settled = false;
      upRes.on("data", (chunk) => {
        if (total >= maxBytes) return;
        chunks.push(chunk);
        total += chunk.length;
        if (total >= maxBytes) {
          upRes.destroy();
          finish();
        }
      });
      upRes.on("end", () => finish());
      upRes.on("close", () => finish());
      upRes.on("error", () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });

      function finish() {
        if (settled) return;
        const buf = Buffer.concat(chunks);
        if (buf.length < 188 || !looksLikeMpegTs(buf)) {
          settled = true;
          resolve(null);
          return;
        }
        settled = true;
        resolve(buf);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

/** Write seg0.ts to disk while the client waits on the playlist (Smarters bootstrap). */
function prewarmHlsSeg0(streamId, packUrl, ua, proxy) {
  const segPath = hlsSegPath(streamId, "seg0.ts");
  if (!segPath || !packUrl) return;
  try {
    const st = fs.statSync(segPath);
    if (st.isFile() && st.size >= 188) return;
  } catch {
    /* cold */
  }
  void fetchUpstreamTsBuffer(packUrl, ua, proxy).then((buf) => {
    if (!buf) return;
    try {
      fs.mkdirSync(path.dirname(segPath), { recursive: true });
      fs.writeFileSync(segPath, buf);
    } catch {
      /* ignore */
    }
  });
}

/** When disk HLS is cold, splice ~2MB MPEG-TS from upstream as seg0 (Smarters bootstrap). */
async function serveUpstreamTsSnippet(upstreamUrl, ua, clientRes, pulseCtx, proxy, maxBytes = 2_000_000) {
  const buf = await fetchUpstreamTsBuffer(upstreamUrl, ua, proxy, maxBytes);
  if (!buf) return false;
  if (pulseCtx) pulseConnection(pulseCtx, buf.length);
  clientRes.writeHead(200, hlsSegHeaders(buf.length));
  clientRes.end(buf);
  return true;
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

function serveInstantTsPlaylist(clientReq, clientRes, pulseCtx) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  const name = pathOnly.replace(/\.m3u8$/i, ".ts").split("/").pop() || "stream.ts";
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
    "#EXTINF:6.000,",
    name,
    "",
  ].join("\n");
  if (pulseCtx) pulseConnection(pulseCtx, Buffer.byteLength(body));
  clientRes.writeHead(200, hlsPlaylistHeaders());
  clientRes.end(body);
}

/** Smarters/LibVLC: return playlist immediately; segments arrive from edge disk packager (XUI-style). */
function serveBootstrapHlsPlaylist(clientReq, clientRes, pulseCtx) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  const base = pathOnly.replace(/\.m3u8$/i, "");
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-ALLOW-CACHE:NO",
    "#EXT-X-TARGETDURATION:4",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXTINF:4.000,",
    `${base}/hls/seg0.ts`,
    "",
  ].join("\n");
  if (pulseCtx) pulseConnection(pulseCtx, Buffer.byteLength(body));
  clientRes.writeHead(200, hlsPlaylistHeaders());
  clientRes.end(body);
}

function pipeLiveMpegTsShared(fan, upRes, clientReq, clientRes, pulseCtx, onUnplayable) {
  const destroySrc = () => {
    try {
      upRes.destroy();
    } catch {
      /* ignore */
    }
  };
  const fail = (msg) => {
    destroyLiveFan(fan);
    if (typeof onUnplayable === "function" && !clientRes.headersSent) {
      onUnplayable(msg);
      return;
    }
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end(msg);
    }
  };

  const goLive = (prefix) => {
    fan.prefix = prefix && prefix.length ? prefix : fan.prefix;
    fanGoLive(fan, destroySrc);
    attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
    upRes.on("data", (chunk) => broadcastFanChunk(fan, chunk));
    upRes.once("end", () => destroyLiveFan(fan));
    upRes.once("close", () => {
      if (liveFans.get(fan.streamId) === fan) destroyLiveFan(fan);
    });
    upRes.once("error", () => destroyLiveFan(fan));
  };

  if (!shouldSniffLiveTs(upRes)) {
    goLive(null);
    return;
  }

  const chunks = [];
  let total = 0;
  let started = false;
  const openTimer = setTimeout(() => {
    if (!started) fail("Upstream timeout before MPEG-TS data");
  }, LIVE_TS_OPEN_MS);

  const onData = (chunk) => {
    if (started) return;
    chunks.push(chunk);
    total += chunk.length;
    if (total < LIVE_TS_PEEK_BYTES) return;
    started = true;
    clearTimeout(openTimer);
    upRes.removeListener("data", onData);
    const prefix = Buffer.concat(chunks);
    if (!looksLikeMpegTs(prefix)) {
      fail("Upstream is not MPEG-TS");
      return;
    }
    goLive(prefix);
  };
  upRes.on("data", onData);
  upRes.once("error", (err) => {
    if (!started) fail(`upstream error: ${err.message}`);
  });
  upRes.once("end", () => {
    if (started) return;
    clearTimeout(openTimer);
    const prefix = Buffer.concat(chunks);
    if (looksLikeMpegTs(prefix)) {
      started = true;
      goLive(prefix);
      return;
    }
    fail("Upstream closed before MPEG-TS data");
  });
}

function feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx) {
  fanGoLive(fan, () => {
    try {
      upRes.destroy();
    } catch {
      /* ignore */
    }
  });
  attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
  upRes.on("data", (chunk) => broadcastFanChunk(fan, chunk));
  upRes.once("end", () => destroyLiveFan(fan));
  upRes.once("error", () => destroyLiveFan(fan));
  // Abrupt provider/socket disconnects commonly emit close without end/error.
  // Never leave a dead fan marked broadcasting: new viewers would join it and
  // receive only the stale prefix, making the channel look permanently hung.
  upRes.once("close", () => destroyLiveFan(fan));
}

function pipeLiveMpegTs(upRes, clientReq, clientRes, pulseCtx, onUnplayable, fan) {
  const meter = pulseCtx ? createLiveByteMeter(pulseCtx) : null;
  const streamId = pulseCtx?.streamId;
  if (!fan && streamId) fan = liveFans.get(streamId) || null;
  let stopKickWatch = () => undefined;
  const failStarter = () => {
    if (fan?.starterLock) releaseLiveFanStarter(fan, false);
  };
  const stopStream = () => {
    stopKickWatch();
    if (fan) return;
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
  registerPipeTeardown(pulseCtx, stopStream);
  clientReq.once("close", () => {
    stopKickWatch();
    endPlaybackSession(pulseCtx);
  });
  clientReq.once("aborted", () => {
    stopKickWatch();
    endPlaybackSession(pulseCtx);
  });
  if (!shouldSniffLiveTs(upRes)) {
    if (fan) {
      feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx);
      return;
    }
    writeLiveTsHead(clientRes);
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
    failStarter();
    stopKickWatch();
    upRes.destroy();
    if (typeof onUnplayable === "function" && !clientRes.headersSent) {
      onUnplayable(msg);
      return;
    }
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
    headersSent = true;
    if (fan) {
      fan.prefix = prefix;
      feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx);
      return;
    }
    writeLiveTsHead(clientRes);
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
      writeLiveTsHead(clientRes);
      clientRes.write(prefix);
      if (meter) meter(prefix);
      clientRes.end();
      return;
    }
    fail("Upstream closed before MPEG-TS data");
  });
}

function pipeUpstream(targetUrl, clientReq, clientRes, { live, redirectsLeft, listenPort, proto, proxy, altProtocolLeft, pulseCtx, failovers, method, retried, htmlRetries = 0, fan = null }) {
  const streamId = pulseCtx?.streamId || "";
  let remaining = Array.isArray(failovers) ? failovers.filter(Boolean) : [];
  if (live && remaining.length) {
    const ordered = orderLiveUpstreamTargets(streamId, targetUrl, remaining);
    targetUrl = ordered.upstream;
    remaining = ordered.failovers;
  }
  const reqMethod = String(method || clientReq.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET";
  const tryNext = (reason) => {
    if (clientRes.headersSent) return false;
    markUpstreamFailed(streamId, targetUrl);
    if (remaining.length) {
      const next = remaining.shift();
      pipeUpstream(next, clientReq, clientRes, {
        live,
        redirectsLeft: 5,
        listenPort,
        proto,
        proxy,
        altProtocolLeft: 1,
        pulseCtx,
        failovers: remaining,
        method: reqMethod,
        retried: false,
        fan,
      });
      return true;
    }
    if (fan?.starterLock) releaseLiveFanStarter(fan, false);
    if (live && process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.error(`[iptv-edge-up] live upstream failed (${reason}): ${targetUrl.slice(0, 120)}`);
    }
    return false;
  };
  targetUrl = normalizeUpstreamUrl(targetUrl);
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    if (tryNext("invalid upstream")) return;
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Invalid upstream");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    if (tryNext("unsupported upstream")) return;
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Unsupported upstream");
    return;
  }
  const lib = parsed.protocol === "https:" ? https : http;
  const headers = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    Connection: live ? "close" : "keep-alive",
    "Icy-MetaData": "0",
  };
  if (!live && clientReq.headers.range) headers.Range = clientReq.headers.range;
  delete headers.range;

  const reqOpts = {
    hostname: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
    method: reqMethod,
    path: `${parsed.pathname}${parsed.search}`,
    headers: {
      ...headers,
      Host: parsed.host,
    },
    timeout: 300_000,
  };
  if (parsed.protocol === "https:") reqOpts.rejectUnauthorized = false;
  if (!live && !proxy) {
    reqOpts.agent = parsed.protocol === "https:" ? vodHttpsAgent : vodHttpAgent;
  }
  if (live && !proxy) {
    // Fresh socket per live pull — pooled keep-alive often returns 0-byte CDN responses.
    reqOpts.agent = false;
  } else if (live) {
    reqOpts.agent = false;
  }
  if (proxy) {
    delete reqOpts.agent;
    reqOpts.createConnection = (_opts, cb) => {
      connectOriginSocket(parsed.toString(), proxy, 30_000)
        .then((socket) => cb(null, socket))
        .catch((err) => cb(err, undefined));
    };
  }

  const up = lib.request(reqOpts, (upRes) => {
    const status = upRes.statusCode || 0;
    const loc = upRes.headers.location;
    if (live && process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.error(`[iptv-edge-up] ${status} ${targetUrl} ct=${upRes.headers["content-type"] || ""}`);
    }
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
        failovers: remaining,
        method: reqMethod,
        retried: false,
        fan,
      });
      return;
    }
    if (status < 200 || status >= 300) {
      upRes.resume();
      if (live && (status === 404 || status === 400) && !retried) {
        setTimeout(
          () =>
            pipeUpstream(targetUrl, clientReq, clientRes, {
              live,
              redirectsLeft,
              listenPort,
              proto,
              proxy,
              altProtocolLeft,
              pulseCtx,
              failovers: remaining,
              method: reqMethod,
              retried: true,
              fan,
            }),
          200
        );
        return;
      }
      if (altProtocolLeft > 0 && !isUpstreamKnownBad(streamId, targetUrl)) {
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
            failovers: remaining,
            method: reqMethod,
            retried: false,
            fan,
          });
          return;
        } catch {
          /* fall through */
        }
      }
      // Provider auth errors: try alts / protocol flip — never forward live to panel (wrong egress IP).
      if (live && (status === 401 || status === 403 || status === 407)) {
        if (tryNext(`upstream ${status}`)) return;
        if (!clientRes.headersSent) {
          clientRes.writeHead(status, { "content-type": "text/plain" });
          clientRes.end("upstream denied");
        }
        return;
      }
      if (tryNext("upstream status")) {
        sendPlaybackEvent(pulseCtx, "playback_origin_fail", `upstream ${status}, trying backup`, status);
        return;
      }
      sendPlaybackEvent(pulseCtx, "playback_drop", `upstream ${status} and no backup left`, status);
      if (!clientRes.headersSent) {
        clientRes.writeHead(status || 502, { "content-type": "text/plain" });
      }
      clientRes.end("upstream error");
      return;
    }
    if (live) {
      clearUpstreamFailure(streamId, targetUrl);
      const ct = String(upRes.headers["content-type"] || "").toLowerCase();
      const loc2 = String(upRes.headers.location || "");
      if (/mpegurl|x-mpegurl/.test(ct) || /\.m3u8/i.test(loc2) || isHlsPlaybackUrl(targetUrl)) {
        upRes.resume();
        up.destroy();
        if (fan) releaseLiveFanStarter(fan, true);
        spawnEdgeHlsToMpegTs(
          loc2 && /\.m3u8/i.test(loc2) ? new URL(loc2, parsed).toString() : targetUrl,
          clientReq,
          clientRes,
          pulseCtx
        );
        return;
      }
      if (ct.includes("html") || ct.includes("json") || ct.startsWith("text/")) {
        upRes.resume();
        up.destroy();
        // Failover URLs first — instant zapping beats retrying a dead CDN path.
        if (tryNext("non-media content-type")) return;
        if (live && htmlRetries < 2 && !isUpstreamKnownBad(streamId, targetUrl)) {
          setTimeout(
            () =>
              pipeUpstream(targetUrl, clientReq, clientRes, {
                live,
                redirectsLeft,
                listenPort,
                proto,
                proxy,
                altProtocolLeft,
                pulseCtx,
                failovers: remaining,
                method: reqMethod,
                retried,
                htmlRetries: htmlRetries + 1,
                fan,
              }),
            120 * (htmlRetries + 1)
          );
          return;
        }
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { "content-type": "text/plain" });
          clientRes.end("Upstream returned non-media");
        }
        return;
      }
      pipeLiveMpegTs(upRes, clientReq, clientRes, pulseCtx, () => {
        if (tryNext("not mpegts")) return;
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { "content-type": "text/plain" });
          clientRes.end("Upstream is not MPEG-TS");
        }
      }, fan);
      return;
    }
    if (reqMethod === "HEAD") {
      clientRes.writeHead(status || 200, vodClientHeaders(upRes.headers));
      upRes.resume();
      clientRes.end();
      return;
    }
    clientRes.writeHead(status || 200, vodClientHeaders(upRes.headers));
    upRes.pipe(clientRes);
  });
  up.on("timeout", () => up.destroy(new Error("upstream timeout")));
  up.on("error", (err) => {
    if (altProtocolLeft > 0 && !clientRes.headersSent && !isUpstreamKnownBad(streamId, targetUrl)) {
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
          failovers: remaining,
          method: reqMethod,
          retried: false,
          fan,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    if (!clientRes.headersSent) {
      if (tryNext(err.message)) return;
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end("upstream error");
  });
  clientReq.on("close", () => up.destroy());
  up.end();
}

function denyAuth(clientRes, status) {
  const msg = status === 401 ? "Unauthorized" : status === 404 ? "Not found" : "Forbidden";
  clientRes.writeHead(status, { "content-type": "text/plain" });
  clientRes.end(msg);
}

/**
 * XUI-style disk HLS: auth first, then serve from /var/lib/nexlify/hls/<cuid>/.
 * URL stream keys are often numeric Xtream IDs; the packager directory is the cuid.
 * Disk miss forwards to Next so ensureDiskHls can start ffmpeg.
 */
async function handleDiskHls(clientReq, clientRes, ctx, kind, segName) {
  if (!edgeCanAuthLive()) {
    clientRes.writeHead(503, { "content-type": "text/plain" });
    clientRes.end("edge auth unavailable");
    return;
  }
  let auth;
  try {
    auth = await authLiveCached(clientReq);
  } catch {
    clientRes.writeHead(503, { "content-type": "text/plain" });
    clientRes.end("edge auth timeout");
    return;
  }
  if (auth.status === 401 || auth.status === 403 || auth.status === 429 || auth.status === 404) {
    denyAuth(clientRes, auth.status);
    return;
  }
  const pulseCtx =
    auth.lineId && auth.streamId
      ? { lineId: auth.lineId, streamId: auth.streamId, ip: clientIp(clientReq), hls: true }
      : null;
  const isHead = String(clientReq.method || "GET").toUpperCase() === "HEAD";
  if (pulseCtx && !isHead) touchPlaybackSession(pulseCtx, { hls: true });
  if (auth.passthrough || auth.status !== 200 || !auth.streamId) {
    clientRes.writeHead(auth.status && auth.status !== 200 ? auth.status : 502, {
      "content-type": "text/plain",
    });
    clientRes.end("hls auth failed");
    return;
  }
  const streamId = auth.streamId;
  const packUrl = auth.upstream || "";
  const outboundProxy = effectiveOutboundProxy(auth.outboundProxy || null);
  if (packUrl && !isHead) {
    startEdgeDiskPackager(streamId, packUrl, clientReq.headers["user-agent"], outboundProxy);
    touchHlsDaemon(streamId);
  }
  if (auth.hlsNative && !packUrl) {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("native hls missing upstream");
    return;
  }

  if (kind === "seg") {
    const deadline = Date.now() + EDGE_HLS_SEG_WAIT_MS;
    while (Date.now() < deadline) {
      if (clientReq.method === "HEAD") {
        const segPath = hlsSegPath(streamId, segName);
        try {
          if (segPath) {
            const st = fs.statSync(segPath);
            if (st.isFile() && st.size > 0) {
              clientRes.writeHead(200, hlsSegHeaders(st.size));
              clientRes.end();
              return;
            }
          }
        } catch {
          /* keep polling */
        }
      } else if (await serveHlsSegment(streamId, segName, clientRes, pulseCtx)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    if (packUrl && /^seg0\.ts$/i.test(segName)) {
      const ok = await serveUpstreamTsSnippet(
        packUrl,
        clientReq.headers["user-agent"],
        clientRes,
        pulseCtx,
        outboundProxy
      );
      if (ok) return;
    }
    clientRes.writeHead(503, { "content-type": "text/plain", "retry-after": "1" });
    clientRes.end("Segment not ready");
    return;
  }

  if (clientReq.method === "HEAD") {
    clientRes.writeHead(200, hlsPlaylistHeaders());
    clientRes.end();
    return;
  }
  if (serveHlsPlaylist(streamId, clientReq, clientRes, pulseCtx)) return;
  if (packUrl) {
    prewarmHlsSeg0(streamId, packUrl, clientReq.headers["user-agent"], outboundProxy);
    serveBootstrapHlsPlaylist(clientReq, clientRes, pulseCtx);
    return;
  }
  serveInstantTsPlaylist(clientReq, clientRes, pulseCtx);
}

async function onRequest(clientReq, clientRes, ctx) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1" && pathOnly.startsWith("/live/")) {
    console.log(`[iptv-edge-req] ${clientReq.method} ${pathOnly}`);
  }

  if (pathOnly === "/edge/fan-stats") {
    const channels = [];
    let clients = 0;
    for (const fan of liveFans.values()) {
      const n = fan.clients.size;
      clients += n;
      channels.push({
        streamId: fan.streamId,
        clients: n,
        broadcasting: !!fan.broadcasting,
      });
    }
    clientRes.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(JSON.stringify({ fans: liveFans.size, clients, channels }));
    return;
  }

  if (clientReq.method === "OPTIONS") {
    clientRes.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept, Range",
    });
    clientRes.end();
    return;
  }

  // Fast lane: login + admin skip catalog cache; catalog actions use edge gzip cache.
  if (isPanelPriorityPath(pathOnly)) {
    const url = clientReq.url || "/";
    if (isCatalogPath(pathOnly) && catalogActionCacheable(url)) {
      forwardCatalogCached(clientReq, clientRes, ctx);
    } else {
      forward(clientReq, clientRes, ctx);
    }
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
    if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1" && /^\/live\//.test(pathOnly)) {
      console.error(`[iptv-edge] no-splice ${pathOnly}`);
    }
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (!edgeCanAuthLive()) {
    if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.error("[iptv-edge] edgeCanAuthLive=false");
    }
    forward(clientReq, clientRes, ctx);
    return;
  }
  try {
    let auth = await authLiveCached(clientReq);
    if ((auth.passthrough || !auth.upstream) && TIMESHIFT_RE.test(pathOnly)) {
      const tsAuth = await authTimeshiftViaLive(clientReq);
      if (tsAuth?.upstream && !tsAuth.passthrough && tsAuth.status === 200) auth = tsAuth;
    }
    if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.log(
        `[iptv-edge-auth] ${auth.status} live=${auth.live} upstream=${Boolean(auth.upstream)} passthrough=${auth.passthrough} stream=${auth.streamId || ""}`
      );
    }
    if (auth.passthrough || !auth.upstream) {
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (auth.status === 401 || auth.status === 403 || auth.status === 429 || auth.status === 404) {
      clientRes.writeHead(auth.status, { "content-type": "text/plain" });
      clientRes.end(auth.status === 401 ? "Unauthorized" : auth.status === 404 ? "Not found" : "Forbidden");
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
    const isLiveRangeProbe = Boolean(
      auth.live && clientReq.method !== "HEAD" && isTinyLiveRangeProbe(clientReq.headers.range)
    );
    if (pulseCtx && clientReq.method !== "HEAD" && !isLiveRangeProbe) touchPlaybackSession(pulseCtx);
    if (isLiveRangeProbe || (clientReq.method === "HEAD" && auth.live)) {
      writeLiveTsHead(clientRes);
      clientRes.end();
      return;
    }
    if (auth.live && auth.streamId && tryJoinLiveFan(auth.streamId, clientReq, clientRes, pulseCtx)) {
      return;
    }
    let fan = null;
    if (auth.live && auth.streamId) {
      const acquired = acquireLiveFanStarter(auth.streamId);
      if (acquired.mode === "join" && tryJoinLiveFan(auth.streamId, clientReq, clientRes, pulseCtx)) {
        return;
      }
      if (acquired.mode === "wait") {
        queueLiveFanWaiter(acquired.fan, clientReq, clientRes, pulseCtx);
        return;
      }
      if (acquired.mode === "start") fan = acquired.fan;
    }
    const ordered = orderLiveUpstreamTargets(auth.streamId || "", auth.upstream, auth.alts || []);
    if (auth.live && isHlsPlaybackUrl(ordered.upstream)) {
      spawnEdgeHlsToMpegTs(ordered.upstream, clientReq, clientRes, pulseCtx);
      if (fan) releaseLiveFanStarter(fan, true);
      return;
    }
    pipeUpstream(ordered.upstream, clientReq, clientRes, {
      live: auth.live,
      redirectsLeft: 5,
      altProtocolLeft: 1,
      proxy: effectiveOutboundProxy(auth.outboundProxy),
      pulseCtx,
      failovers: ordered.failovers,
      method: clientReq.method,
      retried: false,
      fan,
      ...ctx,
    });
  } catch (err) {
    if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.log(`[iptv-edge-auth-err] ${err?.message || err}`);
    }
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

async function startEdge() {
  await waitForBackendReady();
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
}

startEdge().catch((err) => {
  console.error("[iptv-edge] startup failed:", err);
  process.exit(1);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
