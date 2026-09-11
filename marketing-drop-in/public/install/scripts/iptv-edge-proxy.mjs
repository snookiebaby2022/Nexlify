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
 *   IPTV_EDGE_OFFLINE_SPLASH=1   # loop MPEG-TS "STREAM OFFLINE" when origin is dead (0 to disable)
 *   IPTV_EDGE_OFFLINE_PNG=...    # optional still image for the splash encoder
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
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  edgeRedisEnabled,
  edgeRedisGetAuth,
  edgeRedisSetAuth,
  edgeRedisGetSeg,
  edgeRedisSetSeg,
} from "./edge-redis-auth.mjs";
import {
  edgeSlotsEnabled,
  edgeTryAcquireConnSlot,
  edgeReleaseConnSlot,
} from "./edge-redis-slots.mjs";

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
    if (k.startsWith("IPTV_EDGE_") || process.env[k] == null || process.env[k] === "") {
      process.env[k] = v;
    }
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
  // Short panel auth/session calls only — never used for upstream video bytes.
  // KeepAlive off so a flapping panel cannot pin sockets forever.
  keepAlive: false,
  maxSockets: Number(process.env.IPTV_EDGE_LIVE_SOCKETS || 512),
  timeout: 8_000,
});
/** Hard ceiling for live-auth including Agent queue wait (Node request timeout starts only after a socket is assigned). */
const LIVE_AUTH_DEADLINE_MS = Number(process.env.IPTV_EDGE_AUTH_DEADLINE_MS || 10_000);
let lastEventLoopLagMs = 0;
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
/** Short positive TTL when line maxConnections is 1 — reduces stale multi-device admits. */
const AUTH_CACHE_TTL_STRICT_MS = Number(process.env.IPTV_EDGE_AUTH_CACHE_STRICT_MS || 20_000);
/** Negative cache for 403/429 so we don't hammer panel after max-conn deny. */
const AUTH_DENY_TTL_MS = Number(process.env.IPTV_EDGE_AUTH_DENY_MS || 8_000);
const CATALOG_CACHE_MS = Number(process.env.IPTV_EDGE_CATALOG_CACHE_MS || 300_000);
const CATALOG_STALE_MS = Number(process.env.IPTV_EDGE_CATALOG_STALE_MS || 600_000);
const EDGE_DISK_HLS_WAIT_MS = Number(process.env.IPTV_EDGE_DISK_HLS_WAIT_MS || 6000);
const EDGE_HLS_SEG_WAIT_MS = Number(process.env.IPTV_EDGE_HLS_SEG_WAIT_MS || 5_000);
const MAX_EDGE_HLS_REMUX = Number(process.env.IPTV_EDGE_MAX_HLS_REMUX || 256);
const MAX_EDGE_DISK_PACK = Number(process.env.IPTV_EDGE_MAX_DISK_PACK || 256);
/** One provider pull per live channel while anyone is watching (XUI on-demand restream). */
const MAX_LIVE_FANS = Number(process.env.IPTV_EDGE_MAX_LIVE_FANS || 8000);
const LIVE_FAN_LINGER_MS = Number(process.env.IPTV_EDGE_LIVE_FAN_LINGER_MS || 45000);
const ON_DEMAND_FAN_LINGER_MS = Number(process.env.IPTV_EDGE_ON_DEMAND_FAN_LINGER_MS || 45000);
const LIVE_FAN_PREFIX_BYTES = Math.max(
  188 * 24,
  Math.min(Number(process.env.IPTV_EDGE_FAN_PREFIX_BYTES || 1_048_576), 8_388_608)
);
/**
 * Silent underrun: provider TCP stays open after dumping a prefix, then 0 growth.
 * Reconnect (and mark primary bad so failover rotates) when no upstream bytes for N ms.
 * Tunable — keep above normal GOP/keyframe gaps; 12s is safe for continuous MPEG-TS live.
 */
const LIVE_FAN_STALL_MS = Math.max(
  3_000,
  Math.min(Number(process.env.IPTV_EDGE_FAN_STALL_MS || 12_000), 120_000)
);
const LIVE_FAN_STALL_SWEEP_MS = Math.max(
  1_000,
  Math.min(Number(process.env.IPTV_EDGE_FAN_STALL_SWEEP_MS || 3_000), LIVE_FAN_STALL_MS)
);
/**
 * Optional proactive refresh of signed CDN redirects (junki→mybmcdn/auth/…).
 * Default OFF (0): VLC holds one signed URL until the origin dies; killing a
 * healthy pull mid-GOP freezes video while audio continues. Stall sweep still
 * reconnects when bytes stop. Set IPTV_EDGE_FAN_AUTH_REFRESH_MS>0 only if the
 * CDN keeps a dead socket "alive" past LIVE_FAN_STALL_MS.
 */
const LIVE_FAN_AUTH_REFRESH_MS = (() => {
  const raw = Number(process.env.IPTV_EDGE_FAN_AUTH_REFRESH_MS ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(60_000, Math.min(raw, 900_000));
})();
/** Max bytes to buffer after reconnect while waiting for a video keyframe. */
const LIVE_FAN_KEYFRAME_HOLD_BYTES = Math.max(
  188 * 64,
  Math.min(Number(process.env.IPTV_EDGE_FAN_KEYFRAME_HOLD_BYTES || 2_500_000), 8_388_608)
);
/** Soft lag: skip-to-live instead of killing the socket (XUI-style).
 *  Hard drop only after extreme lag — disconnect+reconnect feels like buffering. */
const MAX_CLIENT_LAG_BYTES = Number(process.env.IPTV_EDGE_MAX_CLIENT_LAG_BYTES || 24_000_000);
const MAX_CLIENT_LAG_MS = Number(process.env.IPTV_EDGE_MAX_CLIENT_LAG_MS || 25_000);
const MAX_CLIENT_HARD_DROP_MS = Number(process.env.IPTV_EDGE_MAX_CLIENT_HARD_DROP_MS || 90_000);
const MAX_CLIENT_HARD_DROP_BYTES = Number(process.env.IPTV_EDGE_MAX_CLIENT_HARD_DROP_BYTES || 96_000_000);
/** Stop idle disk HLS packagers after no segment requests. */
const DISK_PACK_IDLE_MS = Number(process.env.IPTV_EDGE_DISK_PACK_IDLE_MS || 45_000);
const DISK_PACK_IDLE_SWEEP_MS = Math.min(DISK_PACK_IDLE_MS, 15_000);
/** streamId -> { proc, key, clients, prefix } — refcounted native-HLS remux */
const edgeHlsRemuxSessions = new Map();
const edgeDiskPackagers = new Map();
/** streamId -> last segment/playlist request timestamp */
const diskPackLastAccess = new Map();
/** cacheKey -> Promise<Buffer|null> — coalesce cold HLS segment reads */
const hlsSegInflight = new Map();
const edgeMetrics = {
  laggedDrops: 0,
  laggedSkips: 0,
  offlineSplashServes: 0,
  fanCapacityRejections: 0,
  diskPackIdleStops: 0,
  hlsSegCoalesced: 0,
  fanStallClears: 0,
  fanAuthRefresh: 0,
  fanKeyframeHolds: 0,
  fanKeyframeHoldTimeouts: 0,
  eventLoopDelayMs: 0,
};
/** streamId -> shared MPEG-TS restream */
/** streamId -> fan (aliases allowed: multiple catalog rows share one fan object). */
const liveFans = new Map();
/** host+pathname of panel streamUrl -> fan — coalesce FHD/HD/SD of same feed into one CDN pull. */
const liveFansByUpstream = new Map();

function normalizeUpstreamFanKey(url) {
  try {
    const u = new URL(String(url || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // Pre-auth catalog URLs (junki/xtream paths). Do NOT key on post-302 CDN tokens.
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`;
  } catch {
    return "";
  }
}

/**
 * Auth-redirect catalogs should NOT coalesce FHD/HD/SD/aliases onto one fan.
 * Duplicate rows sharing one junki URL (e.g. F1 SD+FHD+UHD → same path) otherwise
 * share one signed CDN token — one stall glitches every “channel”.
 * Viewers of the *same* streamId still share via liveFans.get(streamId).
 */
function upstreamIsolatesFan(url) {
  if (process.env.IPTV_EDGE_COALESCE_SAME_URL === "1") return false;
  if (process.env.IPTV_EDGE_COALESCE_SAME_URL === "0") return true;
  try {
    const u = new URL(String(url || "").trim());
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (/junki3monk3y|mybmcdn|\.bmcdn\.|cdn\.auth/i.test(host)) return true;
    if (/\/auth\//i.test(path)) return true;
    const extra = String(process.env.IPTV_EDGE_ISOLATE_FAN_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extra.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function safeClientEnd(clientRes, body) {
  if (!clientRes || clientRes.writableEnded || clientRes.destroyed) return;
  try {
    if (body == null) clientRes.end();
    else clientRes.end(body);
  } catch {
    /* ignore write-after-end / closed sockets */
  }
}

/** Orphan HLS ffmpeg left behind after edge crashes starve live fans on the same upstream. */
function killOrphanHlsFfmpeg() {
  const hlsRoot = String(process.env.NEXLIFY_HLS_DIR || "/var/lib/nexlify/hls");
  try {
    const out = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
    const known = new Set(
      [...edgeDiskPackagers.values()].map((p) => p?.pid).filter((n) => Number.isFinite(n) && n > 1)
    );
    let killed = 0;
    for (const line of String(out.stdout || "").split("\n")) {
      if (!line.includes("ffmpeg") || !line.includes(hlsRoot)) continue;
      const pid = Number(String(line).trim().split(/\s+/)[0]);
      if (!Number.isFinite(pid) || pid <= 1 || known.has(pid)) continue;
      try {
        process.kill(pid, "SIGTERM");
        killed += 1;
      } catch {
        /* ignore */
      }
    }
    if (killed) console.warn(`[iptv-edge] killed ${killed} orphan HLS ffmpeg (left after prior crash)`);
  } catch {
    /* ignore */
  }
}

function uniqueLiveFanCount() {
  const seen = new Set();
  for (const fan of liveFans.values()) seen.add(fan);
  return seen.size;
}

function uniqueLiveFans() {
  return [...new Set(liveFans.values())];
}
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

function isTinyLiveRangeProbe(range, ua) {
  if (userAgentIsSmartTv(ua)) return false;
  const r = String(range ?? "").trim();
  if (!r) return false;
  const m = /^bytes=(\d+)-(\d+)$/i.exec(r);
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  return end - start < 65536;
}

function userAgentIsSmartTv(ua) {
  const s = String(ua || "").toLowerCase();
  return (
    s.includes("web0s") ||
    s.includes("webos") ||
    s.includes("tizen") ||
    s.includes("netcast") ||
    s.includes("webappmanager") ||
    s.includes("smarttv") ||
    s.includes("smart-tv")
  );
}

function rewriteLiveTsUrlToHls(url) {
  const raw = String(url || "/");
  const q = raw.indexOf("?");
  const pathOnly = q >= 0 ? raw.slice(0, q) : raw;
  const qs = q >= 0 ? raw.slice(q) : "";
  if (!/^\/live\/[^/]+\/[^/]+\/[^/]+\.ts$/i.test(pathOnly)) return raw;
  return `${pathOnly.replace(/\.ts$/i, ".m3u8")}${qs}`;
}

/** Exo/Chrome can play an instant HLS wrap. Smarters/LibVLC need real HLS segments. */
function userAgentAllowsInstantTsWrap(ua) {
  const s = String(ua || "").toLowerCase();
  if (!s) return false;
  if (userAgentIsSmartTv(s)) return false;
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
  const trustCloudflare = /^(1|true|yes|always)$/i.test(
    String(process.env.IPTV_EDGE_TRUST_CLOUDFLARE || "")
  );
  if (trustCloudflare) {
    const cfIp = stripIp(req.headers["cf-connecting-ip"]);
    if (isValidIpLiteral(cfIp) && !isInfraOrLoopbackIp(cfIp)) return cfIp;
  }
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
const pendingPulseBatch = new Map();
let pulseBatchTimer = null;

function queueConnectionPulse(ctx, bytes, idleMs) {
  if (!INTERNAL_SECRET || !ctx?.lineId || !ctx?.streamId) return;
  const key = playbackSessionKey(ctx);
  const n = Math.max(0, Math.floor(bytes ?? 0));
  const idle = Math.max(0, Math.floor(idleMs ?? ctx?.idleMs ?? 0));
  const prev = pendingPulseBatch.get(key);
  pendingPulseBatch.set(key, {
    lineId: ctx.lineId,
    streamId: ctx.streamId,
    ip: ctx.ip ?? "",
    bytes: (prev?.bytes ?? 0) + n,
    idleMs: Math.max(prev?.idleMs ?? 0, idle),
    onDemand: Boolean(ctx.onDemand || prev?.onDemand),
  });
}

function flushConnectionPulseBatch() {
  if (!INTERNAL_SECRET || pendingPulseBatch.size === 0) return;
  const sessions = [...pendingPulseBatch.values()];
  pendingPulseBatch.clear();
  const body = JSON.stringify({ sessions });
  const req = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: "/api/internal/connection-pulse-batch",
      method: "POST",
      agent: false,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-panel-internal-secret": INTERNAL_SECRET,
        "x-panel-api-key": INTERNAL_SECRET,
      },
      timeout: 5000,
    },
    (res) => res.resume()
  );
  req.on("error", () => undefined);
  req.on("timeout", () => req.destroy());
  req.write(body);
  req.end();
}

function ensurePulseBatchTimer() {
  if (pulseBatchTimer) return;
  pulseBatchTimer = setInterval(flushConnectionPulseBatch, SESSION_KEEPALIVE_MS);
}

function sendConnectionPulse(ctx, bytes, idleMs) {
  queueConnectionPulse(ctx, bytes, idleMs);
  ensurePulseBatchTimer();
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
      agent: false,
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

function reportViewerPlaybackDrop(clientReq, auth, detail, status) {
  if (!auth?.streamId || !auth?.lineId) return;
  if (clientReq.method === "HEAD") return;
  if (isTinyLiveRangeProbe(clientReq.headers.range, clientReq.headers["user-agent"])) return;
  sendPlaybackEvent(
    { lineId: auth.lineId, streamId: auth.streamId, ip: clientIp(clientReq) },
    "playback_drop",
    detail,
    status
  );
}

function pulseConnection(ctx, bytes, idleMs) {
  touchPlaybackSession(ctx, { hls: Boolean(ctx?.hls) });
  sendConnectionPulse(ctx, bytes, idleMs);
  // Open / meaningful media: flush immediately so Live Connections updates without
  // waiting for the keepalive interval (often 45s).
  if ((bytes ?? 0) >= 32_000) flushConnectionPulseBatch();
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
        agent: false,
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
  if (!ctx?.lineId || !ctx?.streamId) return;
  clearPlaybackSession(ctx);
  pendingPulseBatch.delete(playbackSessionKey(ctx));
  void edgeReleaseConnSlot(ctx.lineId, {
    clientIp: ctx.ip,
    streamId: ctx.streamId,
  });
  if (!INTERNAL_SECRET) return;
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
      agent: false,
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
function connectionQoeEnabled() {
  const raw = String(process.env.NEXLIFY_CONNECTION_QOE ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return false;
}
const CONNECTION_QOE_ENABLED = connectionQoeEnabled();
const SESSION_KEEPALIVE_MS = Math.max(
  5_000,
  Number(
    process.env.IPTV_EDGE_SESSION_KEEPALIVE_MS ||
      (CONNECTION_QOE_ENABLED ? 15_000 : 45_000)
  )
);
/** HLS playlist polls stop when the app exits — close the panel row quickly. */
const SESSION_IDLE_MS = Number(process.env.IPTV_EDGE_SESSION_IDLE_MS || 120_000);

function playbackSessionKey(ctx) {
  return `${ctx.lineId}|${ctx.ip ?? ""}|${ctx.streamId}`;
}

/**
 * Single-connection lines only: when the same IP zaps to another stream, drop the
 * previous pipe + panel row. Multi-connection lines (maxConnections > 1) must NOT
 * tear down siblings — household NAT / second device shares one public IP and
 * killing the first stream looks like "buffering on 1 connection".
 * If maxConnections is unknown (0/missing), do not tear down — client close already
 * ends the old pipe; probes must never kill a live viewer.
 */
function stopOtherPlaybackSessions(ctx) {
  const maxConn = Number(ctx?.maxConnections);
  if (!(Number.isFinite(maxConn) && maxConn === 1)) return;
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
        pendingPulseBatch.delete(key);
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
      sendConnectionPulse(session.ctx, 0);
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
  let lastChunk = 0;
  let longestIdle = 0;
  return (chunk) => {
    const n = chunk?.length ?? 0;
    if (n <= 0) return;
    const now = Date.now();
    markPlaybackSessionActive(pulseCtx, now);
    if (lastChunk > 0) {
      const gap = now - lastChunk;
      if (gap > longestIdle) longestIdle = gap;
    }
    lastChunk = now;
    pending += n;
    if (lastPulse === 0) lastPulse = now;
    // Aggregate bytes locally. A bitrate-based threshold generated several DB
    // writes per second per viewer and made the panel unavailable.
    if (now - lastPulse >= SESSION_KEEPALIVE_MS) {
      pulseConnection(pulseCtx, pending, longestIdle);
      pending = 0;
      lastPulse = now;
      longestIdle = 0;
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
  const rejectSelf = (u) => {
    try {
      const p = new URL(u);
      const host = p.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      // Never pull media from panel/edge IPs — that is the 10gbs↔panel live loop.
      if (EDGE_INFRA_IPS.has(host) || host === String(backendHost || "").toLowerCase()) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  };
  if (rejectSelf(upstream)) {
    return { ...data, upstream: "", alts: [], passthrough: true };
  }
  const alts = (data.alts || [])
    .map((u) => normalizeUpstreamUrl(u))
    .filter((u) => {
      try {
        const p = new URL(u);
        if (p.protocol !== "http:" && p.protocol !== "https:") return false;
        return !rejectSelf(u);
      } catch {
        return false;
      }
    });
  return { ...data, upstream, alts };
}

/** True if an elementary payload contains an H.264 IDR or HEVC IRAP NAL. */
function mpegTsPayloadHasVideoKeyframe(payload) {
  if (!payload?.length) return false;
  for (let i = 0; i + 4 < payload.length; i++) {
    let nal = -1;
    if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1) {
      nal = i + 3;
    } else if (
      payload[i] === 0 &&
      payload[i + 1] === 0 &&
      payload[i + 2] === 0 &&
      payload[i + 3] === 1
    ) {
      nal = i + 4;
    }
    if (nal < 0 || nal >= payload.length) continue;
    const b = payload[nal];
    const h264Type = b & 0x1f;
    if (h264Type === 5) return true; // IDR
    const hevcType = (b >> 1) & 0x3f;
    // IDR_W_RADL / IDR_N_LP / CRA_NUT — clean random-access points
    if (hevcType === 19 || hevcType === 20 || hevcType === 21) return true;
  }
  return false;
}

/**
 * Scan MPEG-TS for a video keyframe. Returns byte offset of the TS packet that
 * contains it, or -1. Used after reconnect so clients are not fed mid-GOP.
 */
function findMpegTsKeyframeOffset(buf) {
  if (!buf?.length || buf.length < 188) return -1;
  let start = 0;
  for (let i = 0; i < Math.min(188, buf.length - 376); i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) {
      start = i;
      break;
    }
  }
  for (let i = start; i + 188 <= buf.length; i += 188) {
    if (buf[i] !== 0x47) {
      let resync = -1;
      for (let j = i + 1; j + 376 <= buf.length && j < i + 188; j++) {
        if (buf[j] === 0x47 && buf[j + 188] === 0x47 && buf[j + 376] === 0x47) {
          resync = j;
          break;
        }
      }
      if (resync < 0) break;
      i = resync;
    }
    const afc = (buf[i + 3] >> 4) & 0x3;
    if (afc !== 1 && afc !== 3) continue;
    let p = i + 4;
    if (afc === 3) {
      if (p >= i + 188) continue;
      p = i + 5 + buf[i + 4];
    }
    if (p >= i + 188) continue;
    if (mpegTsPayloadHasVideoKeyframe(buf.subarray(p, i + 188))) return i;
  }
  return -1;
}

function armFanKeyframeHold(fan) {
  if (!fan || fan.clients.size === 0) return;
  fan.holdUntilKeyframe = true;
  fan.holdChunks = [];
  fan.holdBytes = 0;
  // Drop the pre-reconnect rolling tail so late joiners are not fed a torn GOP.
  fan.prefixChunks = [];
  fan.prefixBytes = 0;
  fan.prefix = Buffer.alloc(0);
  edgeMetrics.fanKeyframeHolds = (edgeMetrics.fanKeyframeHolds || 0) + 1;
}

/** Try to release buffered reconnect bytes starting at the first video keyframe. */
function releaseFanKeyframeHold(fan, force = false) {
  if (!fan?.holdUntilKeyframe) return null;
  const held =
    fan.holdBytes > 0 && Array.isArray(fan.holdChunks) && fan.holdChunks.length
      ? Buffer.concat(fan.holdChunks, fan.holdBytes)
      : Buffer.alloc(0);
  const kfAt = held.length ? findMpegTsKeyframeOffset(held) : -1;
  if (kfAt < 0 && !force) return null;
  fan.holdUntilKeyframe = false;
  fan.holdChunks = [];
  fan.holdBytes = 0;
  if (!held.length) return null;
  if (kfAt < 0 && force) {
    edgeMetrics.fanKeyframeHoldTimeouts = (edgeMetrics.fanKeyframeHoldTimeouts || 0) + 1;
    console.error(
      `[iptv-edge] fan ${fan.streamId} keyframe hold timeout (${held.length}B) → release`
    );
    appendLiveFanPrefix(fan, held, true);
    return held;
  }
  const release = held.subarray(Math.max(0, kfAt));
  appendLiveFanPrefix(fan, release, true);
  return release;
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

/** XUI-style offline: when origin is dead, keep serving MPEG-TS so apps show a splash instead of buffering. */
const OFFLINE_SPLASH_ENABLED = process.env.IPTV_EDGE_OFFLINE_SPLASH !== "0";
const OFFLINE_SPLASH_KEY = "__nexlify_offline_splash__";
const offlineSplashSessions = new Map();

function offlineSplashPngPath() {
  return (
    process.env.IPTV_EDGE_OFFLINE_PNG ||
    path.join(process.env.NEXLIFY_HLS_DIR || "/var/lib/nexlify/hls", "..", "offline-splash.png")
  );
}

function ensureOfflineSplashPng() {
  const out = path.resolve(offlineSplashPngPath());
  try {
    if (fs.existsSync(out) && fs.statSync(out).size > 2000) return out;
  } catch {
    /* regenerate */
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const font = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  ].find((f) => fs.existsSync(f));
  const ffmpegPath = resolveFfmpegPath();
  const vf = font
    ? `drawtext=fontfile=${font}:text='STREAM OFFLINE':fontsize=56:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-20,drawtext=fontfile=${font}:text='Please try again later':fontsize=28:fontcolor=0x94a3b8:x=(w-text_w)/2:y=(h-text_h)/2+40`
    : null;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x0f172a:s=1280x720:d=1"];
  if (vf) args.push("-vf", vf);
  args.push("-frames:v", "1", out);
  const r = spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 20_000 });
  if (r.status !== 0 || !fs.existsSync(out)) {
    console.error("[iptv-edge] offline splash PNG failed:", r.stderr || r.error || r.status);
    return null;
  }
  return out;
}

function stopOfflineSplashSession(session) {
  if (!session) return;
  offlineSplashSessions.delete(session.key);
  for (const slot of [...session.clients]) detachOfflineSplashClient(session, slot, { closing: true });
  try {
    session.proc?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

function detachOfflineSplashClient(session, slot, opts) {
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
  if (!opts?.closing && session.clients.size === 0) {
    session.idleSince = Date.now();
    if (session.linger) clearTimeout(session.linger);
    session.linger = setTimeout(() => stopOfflineSplashSession(session), 30_000);
  }
}

function attachOfflineSplashClient(session, clientReq, clientRes, pulseCtx) {
  if (session.linger) {
    clearTimeout(session.linger);
    session.linger = null;
  }
  session.idleSince = 0;
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
  const drop = () => detachOfflineSplashClient(session, slot);
  slot.stopKick = watchSessionKick(pulseCtx, drop);
  registerPipeTeardown(pulseCtx, drop);
  if (typeof clientReq.once === "function") {
    clientReq.once("close", drop);
    clientReq.once("aborted", drop);
  }
  session.clients.add(slot);
  edgeMetrics.offlineSplashServes += 1;
}

function ensureOfflineSplashSession() {
  let session = offlineSplashSessions.get(OFFLINE_SPLASH_KEY);
  if (session?.proc && session.proc.exitCode == null && !session.proc.killed) return session;
  if (session) stopOfflineSplashSession(session);

  const png = ensureOfflineSplashPng();
  if (!png) return null;
  const ffmpegPath = resolveFfmpegPath();
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-re",
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    png,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "50",
    "-r",
    "25",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-f",
    "mpegts",
    "pipe:1",
  ];
  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (!proc.stdout) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    return null;
  }
  session = {
    key: OFFLINE_SPLASH_KEY,
    proc,
    clients: new Set(),
    prefix: Buffer.alloc(0),
    linger: null,
    idleSince: 0,
  };
  offlineSplashSessions.set(OFFLINE_SPLASH_KEY, session);
  proc.stdout.on("data", (chunk) => {
    if (!chunk?.length) return;
    const keep = 188 * 40;
    if (!session.prefix?.length) {
      session.prefix = chunk.length <= keep ? chunk : chunk.subarray(chunk.length - keep);
    } else {
      const next = Buffer.concat([session.prefix, chunk]);
      session.prefix = next.length <= keep ? next : next.subarray(next.length - keep);
    }
    for (const slot of [...session.clients]) {
      try {
        if (slot.meter) slot.meter(chunk);
        const ok = slot.clientRes.write(chunk);
        if (!ok) {
          slot.pendingBytes = (slot.pendingBytes || 0) + chunk.length;
          if (slot.pendingBytes > MAX_CLIENT_HARD_DROP_BYTES) detachOfflineSplashClient(session, slot);
        } else slot.pendingBytes = 0;
      } catch {
        detachOfflineSplashClient(session, slot);
      }
    }
  });
  proc.stderr?.on("data", () => undefined);
  proc.once("exit", () => {
    if (offlineSplashSessions.get(OFFLINE_SPLASH_KEY) === session) {
      offlineSplashSessions.delete(OFFLINE_SPLASH_KEY);
      for (const slot of [...session.clients]) detachOfflineSplashClient(session, slot, { closing: true });
    }
  });
  return session;
}

function serveOfflineLiveSplash(clientReq, clientRes, pulseCtx) {
  if (!OFFLINE_SPLASH_ENABLED) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end("upstream unavailable");
    }
    return false;
  }
  const session = ensureOfflineSplashSession();
  if (!session) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
      clientRes.end("offline splash unavailable");
    }
    return false;
  }
  attachOfflineSplashClient(session, clientReq, clientRes, pulseCtx);
  return true;
}

/** Steal live-fan clients onto the shared offline splash (origin dead mid-watch). */
function migrateFanClientsToOfflineSplash(fan) {
  if (!fan || fan.destroyed) return false;
  const session = ensureOfflineSplashSession();
  const slots = [...fan.clients];
  const waiters = fan.waiters.splice(0, fan.waiters.length);
  fan.clients.clear();
  destroyLiveFan(fan);
  if (!session) {
    for (const slot of slots) {
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
    }
    return false;
  }
  for (const slot of slots) {
    try {
      slot.stopKick?.();
    } catch {
      /* ignore */
    }
    attachOfflineSplashClient(session, slot.clientReq, slot.clientRes, slot.pulseCtx);
  }
  for (const w of waiters) {
    attachOfflineSplashClient(session, w.clientReq, w.clientRes, w.pulseCtx);
  }
  return true;
}

function liveFanIsIdle(fan) {
  return (
    fan &&
    !fan.destroyed &&
    !fan.starterLock &&
    fan.clients.size === 0 &&
    fan.waiters.length === 0
  );
}

/** Reclaim linger/zombie fans so a busy edge does not 503 while empty slots exist. */
function reclaimIdleLiveFan() {
  for (const fan of uniqueLiveFans()) {
    if (!liveFanIsIdle(fan)) continue;
    destroyLiveFan(fan);
    return true;
  }
  return false;
}

function sweepIdleLiveFans() {
  const now = Date.now();
  for (const fan of uniqueLiveFans()) {
    if (!liveFanIsIdle(fan)) continue;
    const lingerMs = fan.onDemand ? ON_DEMAND_FAN_LINGER_MS : LIVE_FAN_LINGER_MS;
    const idleFor = now - (fan.idleSince || fan.createdAt || now);
    if (!fan.broadcasting || idleFor >= lingerMs) destroyLiveFan(fan);
  }
}

/**
 * Prefix-then-stall / silent underrun: origin socket never ends, but bytes stop.
 * Destroy the hung pull so handleFanUpstreamGone reconnects (failover-aware).
 */
function forceFanUpstreamReconnect(fan, reason, opts = {}) {
  if (!fan || fan.destroyed) return false;
  if (fan.reconnecting || fan.reconnectTimer) return false;
  const url = String(fan.primaryUpstream || "").trim();
  // Auth refresh must re-hit the catalog URL — do not mark it bad.
  if (url && !opts.authRefresh) markUpstreamFailed(fan.streamId, url);
  if (opts.authRefresh) edgeMetrics.fanAuthRefresh = (edgeMetrics.fanAuthRefresh || 0) + 1;
  else edgeMetrics.fanStallClears += 1;
  const idleMs = Math.max(0, Date.now() - (fan.lastUpstreamByteAt || 0));
  console.error(
    `[iptv-edge] fan ${fan.streamId} ${opts.authRefresh ? "auth refresh" : "stall clear"} (${reason}; idle=${idleMs}ms) → reconnect`
  );
  fan.authRedirectAt = 0;
  const gen = fan.upstreamGen || 0;
  try {
    fan.destroySrc?.();
  } catch {
    /* ignore */
  }
  // Hung sockets may not emit close/end — force the reconnect path if still armed.
  if (!fan.destroyed && fan.upstreamGen === gen && !fan.reconnecting && !fan.reconnectTimer) {
    handleFanUpstreamGone(fan);
  }
  return true;
}

function sweepStalledLiveFans() {
  const now = Date.now();
  for (const fan of uniqueLiveFans()) {
    if (fan.destroyed || fan.reconnecting || fan.reconnectTimer) continue;
    if (!fan.upstreamRes && !fan.destroySrc) continue;
    if (fan.clients.size === 0 && fan.waiters.length === 0) continue;

    // Holding for a post-reconnect keyframe still receives upstream bytes —
    // do not stall-clear or auth-refresh mid-hold.
    if (fan.holdUntilKeyframe) continue;

    if (
      LIVE_FAN_AUTH_REFRESH_MS > 0 &&
      fan.authRedirectAt &&
      now - fan.authRedirectAt >= LIVE_FAN_AUTH_REFRESH_MS
    ) {
      const idleMs = now - (fan.lastUpstreamByteAt || 0);
      // Never cut a healthy signed pull — only refresh when the socket is already quiet.
      if (idleMs >= Math.min(LIVE_FAN_STALL_MS, 5_000)) {
        forceFanUpstreamReconnect(
          fan,
          `signed CDN session age ${now - fan.authRedirectAt}ms (idle=${idleMs}ms)`,
          { authRefresh: true }
        );
      }
      continue;
    }

    const last = fan.lastUpstreamByteAt || 0;
    if (!last) continue;
    const idleMs = now - last;
    if (idleMs < LIVE_FAN_STALL_MS) continue;
    forceFanUpstreamReconnect(fan, `no upstream bytes for ${idleMs}ms`);
  }
}

function destroyLiveFan(fan) {
  if (!fan || fan.destroyed) return;
  fan.destroyed = true;
  fan.reconnecting = false;
  if (fan.reconnectTimer) {
    clearTimeout(fan.reconnectTimer);
    fan.reconnectTimer = null;
  }
  if (fan.linger) {
    clearTimeout(fan.linger);
    fan.linger = null;
  }
  liveFans.delete(fan.streamId);
  if (fan.streamIds instanceof Set) {
    for (const id of fan.streamIds) liveFans.delete(id);
    fan.streamIds.clear();
  }
  if (fan.upstreamKey) liveFansByUpstream.delete(fan.upstreamKey);
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
    fan.idleSince = Date.now();
    if (fan.linger) clearTimeout(fan.linger);
    const lingerMs = fan.onDemand ? ON_DEMAND_FAN_LINGER_MS : LIVE_FAN_LINGER_MS;
    fan.linger = setTimeout(() => destroyLiveFan(fan), lingerMs);
  }
}

function attachLiveFanClient(fan, clientReq, clientRes, pulseCtx) {
  if (fan.linger) {
    clearTimeout(fan.linger);
    fan.linger = null;
  }
  fan.idleSince = 0;
  if (!clientRes.headersSent) {
    writeLiveTsHead(clientRes);
  }
  const prefix = liveFanPrefixBuffer(fan);
  if (prefix.length) {
    try {
      // The fan keeps a rolling byte tail, which may begin mid-packet.
      // Start every newly joined client on an MPEG-TS sync byte.
      let aligned = prefix;
      for (let i = 0; i < Math.min(188, prefix.length); i++) {
        if (
          prefix[i] === 0x47 &&
          prefix[i + 188] === 0x47 &&
          prefix[i + 376] === 0x47
        ) {
          aligned = prefix.subarray(i);
          break;
        }
      }
      clientRes.write(aligned);
    } catch {
      /* ignore */
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

function appendLiveFanPrefix(fan, chunk, reset = false) {
  if (!chunk?.length) return;
  if (reset || !Array.isArray(fan.prefixChunks)) {
    fan.prefixChunks = [];
    fan.prefixBytes = 0;
  }
  fan.prefixChunks.push(chunk);
  fan.prefixBytes += chunk.length;
  while (fan.prefixBytes > LIVE_FAN_PREFIX_BYTES && fan.prefixChunks.length) {
    const extra = fan.prefixBytes - LIVE_FAN_PREFIX_BYTES;
    const first = fan.prefixChunks[0];
    if (first.length <= extra) {
      fan.prefixChunks.shift();
      fan.prefixBytes -= first.length;
    } else {
      fan.prefixChunks[0] = first.subarray(extra);
      fan.prefixBytes -= extra;
    }
  }
  // Retain this compatibility marker without concatenating the rolling buffer
  // on every upstream chunk. It is materialized only when a viewer joins.
  fan.prefix = fan.prefixChunks[fan.prefixChunks.length - 1] || Buffer.alloc(0);
}

function liveFanPrefixBuffer(fan) {
  if (Array.isArray(fan?.prefixChunks) && fan.prefixChunks.length) {
    return fan.prefixChunks.length === 1
      ? fan.prefixChunks[0]
      : Buffer.concat(fan.prefixChunks, fan.prefixBytes);
  }
  return fan?.prefix?.length ? fan.prefix : Buffer.alloc(0);
}

function resumeFanUpstream(fan) {
  if (!fan?.upstreamRes || !fan.upstreamPaused) return;
  fan.upstreamPaused = false;
  try {
    fan.upstreamRes.resume();
  } catch {
    /* ignore */
  }
}

function writeFanChunkToSlot(fan, slot, chunk) {
  // Already skipping: wait for drain, then jump back to live (do not queue lag).
  if (slot.skipping) {
    slot.pendingBytes = (slot.pendingBytes || 0) + chunk.length;
    slot.lagSince = slot.lagSince || Date.now();
    if (
      slot.pendingBytes > MAX_CLIENT_HARD_DROP_BYTES ||
      (slot.lagSince && Date.now() - slot.lagSince > MAX_CLIENT_HARD_DROP_MS)
    ) {
      edgeMetrics.laggedDrops += 1;
      detachLiveFanClient(fan, slot);
      return false;
    }
    return false;
  }

  if (slot.meter) slot.meter(chunk);
  const ok = slot.clientRes.write(chunk);
  if (ok) {
    slot.pendingBytes = 0;
    slot.lagSince = 0;
    return true;
  }
  slot.pendingBytes = (slot.pendingBytes || 0) + chunk.length;
  slot.lagSince = slot.lagSince || Date.now();
  if (!slot.drainListener) {
    slot.drainListener = () => {
      slot.pendingBytes = 0;
      slot.lagSince = 0;
      slot.skipping = false;
      slot.drainListener = null;
      resumeFanUpstream(fan);
    };
    slot.clientRes.once("drain", slot.drainListener);
  }
  // Soft threshold: skip further chunks until socket drains (jump to live).
  // Hard threshold: only then disconnect — avoids buffer/reconnect loops on HEVC/4K.
  if (
    slot.pendingBytes > MAX_CLIENT_LAG_BYTES ||
    (slot.lagSince && Date.now() - slot.lagSince > MAX_CLIENT_LAG_MS)
  ) {
    if (!slot.skipping) {
      slot.skipping = true;
      edgeMetrics.laggedSkips += 1;
    }
    if (
      slot.pendingBytes > MAX_CLIENT_HARD_DROP_BYTES ||
      (slot.lagSince && Date.now() - slot.lagSince > MAX_CLIENT_HARD_DROP_MS)
    ) {
      edgeMetrics.laggedDrops += 1;
      detachLiveFanClient(fan, slot);
      return false;
    }
    return false;
  }
  return false;
}

function broadcastFanChunk(fan, chunk) {
  if (!chunk || !chunk.length) return;
  fan.lastUpstreamByteAt = Date.now();
  fan.upstreamBytesTotal = (fan.upstreamBytesTotal || 0) + chunk.length;

  // After reconnect, suppress mid-GOP bytes until a video keyframe so clients
  // do not freeze on a torn video PES while audio keeps decoding.
  if (fan.holdUntilKeyframe) {
    if (!Array.isArray(fan.holdChunks)) fan.holdChunks = [];
    fan.holdChunks.push(chunk);
    fan.holdBytes = (fan.holdBytes || 0) + chunk.length;
    const force = fan.holdBytes >= LIVE_FAN_KEYFRAME_HOLD_BYTES;
    const release = releaseFanKeyframeHold(fan, force);
    if (!release) return;
    chunk = release;
  } else {
    appendLiveFanPrefix(fan, chunk);
  }

  // Live TV must stay realtime. Never pause the origin because one client is
  // slow — that starves every viewer on the fan. Slow sockets skip-to-live
  // (or hard-drop only after extreme lag).
  for (const slot of [...fan.clients]) {
    try {
      writeFanChunkToSlot(fan, slot, chunk);
    } catch {
      detachLiveFanClient(fan, slot);
    }
  }
}

function tryJoinLiveFan(streamId, clientReq, clientRes, pulseCtx, upstreamUrl) {
  if (!streamId) return false;
  const fan = liveFans.get(streamId);
  if (!fan?.broadcasting) return false;
  if (upstreamUrl && !liveFanMatchesUpstream(fan, upstreamUrl)) {
    // Source URL changed while fan still alive — detach this stream and force a new pull.
    unbindStreamFromLiveFan(fan, streamId);
    return false;
  }
  if (!fan.destroySrc && !fan.prefix?.length && fan.clients.size === 0 && fan.waiters.length === 0) {
    destroyLiveFan(fan);
    return false;
  }
  attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
  return true;
}

/**
 * One upstream pull per streamId (always). Optionally also coalesce distinct
 * streamIds that share the same catalog URL — disabled for auth-redirect CDNs
 * so duplicate F1/etc aliases do not share one expiring token.
 */
function liveFanMatchesUpstream(fan, upstreamUrl) {
  if (!fan || !upstreamUrl) return true;
  const wantKey = normalizeUpstreamFanKey(upstreamUrl);
  const wantRaw = String(upstreamUrl || "").trim();
  if (!wantKey && !wantRaw) return true;
  const haveKey = String(fan.upstreamKey || "").trim() || normalizeUpstreamFanKey(fan.primaryUpstream);
  const haveRaw = String(fan.primaryUpstream || "").trim();
  if (!haveKey && !haveRaw) return true; // fan not bound yet
  if (haveKey && wantKey) return haveKey === wantKey;
  if (haveRaw && wantRaw) {
    const a = normalizeUpstreamFanKey(haveRaw) || haveRaw;
    const b = wantKey || wantRaw;
    return a === b;
  }
  return true;
}

/** Remove one streamId from a (possibly shared) fan; destroy when no aliases remain. */
function unbindStreamFromLiveFan(fan, streamId) {
  if (!fan || fan.destroyed || !streamId) return;
  liveFans.delete(streamId);
  if (fan.streamIds instanceof Set) {
    fan.streamIds.delete(streamId);
  }
  // Kick only this stream's clients/waiters off a shared fan.
  for (const slot of [...fan.clients]) {
    if (slot?.pulseCtx?.streamId === streamId) {
      detachLiveFanClient(fan, slot, { closingFan: false });
    }
  }
  for (let i = fan.waiters.length - 1; i >= 0; i--) {
    const w = fan.waiters[i];
    if (w?.pulseCtx?.streamId !== streamId) continue;
    fan.waiters.splice(i, 1);
    try {
      if (!w.clientRes.headersSent) {
        w.clientRes.writeHead(502, { "content-type": "text/plain" });
      }
      if (!w.clientRes.writableEnded) w.clientRes.end();
    } catch {
      /* ignore */
    }
  }
  const left = fan.streamIds instanceof Set ? fan.streamIds.size : 0;
  if (left === 0) {
    destroyLiveFan(fan);
    return;
  }
  if (fan.streamId === streamId) {
    fan.streamId = [...fan.streamIds][0];
  }
}

function ensureLiveFan(streamId, upstreamUrl) {
  if (!streamId) return null;
  let fan = liveFans.get(streamId);
  if (fan && !fan.destroyed) {
    if (liveFanMatchesUpstream(fan, upstreamUrl)) return fan;
    unbindStreamFromLiveFan(fan, streamId);
    fan = null;
  }

  const isolate = upstreamIsolatesFan(upstreamUrl);
  const ukey = isolate ? "" : normalizeUpstreamFanKey(upstreamUrl);
  if (ukey) {
    const shared = liveFansByUpstream.get(ukey);
    if (shared && !shared.destroyed) {
      liveFans.set(streamId, shared);
      if (!(shared.streamIds instanceof Set)) shared.streamIds = new Set([shared.streamId]);
      shared.streamIds.add(streamId);
      return shared;
    }
  }

  if (uniqueLiveFanCount() >= MAX_LIVE_FANS) {
    if (!reclaimIdleLiveFan()) return null;
    if (uniqueLiveFanCount() >= MAX_LIVE_FANS) return null;
  }
  fan = {
    streamId,
    streamIds: new Set([streamId]),
    upstreamKey: ukey || "",
    isolateUpstream: isolate,
    broadcasting: false,
    waiters: [],
    clients: new Set(),
    destroySrc: null,
    starterLock: false,
    prefix: Buffer.alloc(0),
    prefixChunks: [],
    prefixBytes: 0,
    linger: null,
    destroyed: false,
    createdAt: Date.now(),
    idleSince: Date.now(),
    primaryUpstream: "",
    failovers: [],
    outboundProxy: null,
    upstreamGen: 0,
    reconnectAttempts: 0,
    reconnectTimer: null,
    reconnecting: false,
    lastUpstreamByteAt: 0,
    upstreamBytesTotal: 0,
    authRedirectAt: 0,
    holdUntilKeyframe: false,
    holdChunks: [],
    holdBytes: 0,
  };
  liveFans.set(streamId, fan);
  if (ukey) liveFansByUpstream.set(ukey, fan);
  return fan;
}

/**
 * Provider CDNs (esp. junki→bmcdn) send Connection: close and drop mid-session.
 * Killing the fan disconnects every viewer → play 1s, buffer, reconnect.
 * Keep clients attached and reopen the panel upstream URL (fresh 302 token).
 */
function handleFanUpstreamGone(fan) {
  if (!fan || fan.destroyed) return;
  fan.upstreamRes = null;
  fan.destroySrc = null;
  const hasViewers = fan.clients.size > 0 || fan.waiters.length > 0;
  if (!hasViewers) {
    destroyLiveFan(fan);
    return;
  }
  if (fan.reconnecting || fan.reconnectTimer) return;
  const url = String(fan.primaryUpstream || "").trim();
  if (!url) {
    if (!migrateFanClientsToOfflineSplash(fan)) destroyLiveFan(fan);
    return;
  }
  fan.reconnectAttempts = (fan.reconnectAttempts || 0) + 1;
  if (fan.reconnectAttempts > 12) {
    console.error(`[iptv-edge] fan ${fan.streamId} upstream reconnect exhausted → offline splash`);
    if (!migrateFanClientsToOfflineSplash(fan)) destroyLiveFan(fan);
    return;
  }
  fan.reconnecting = true;
  // Stay joinable so zaps attach as waiters/clients instead of starting a 2nd pull.
  fan.broadcasting = true;
  const delay = Math.min(200 * fan.reconnectAttempts, 1500);
  fan.reconnectTimer = setTimeout(() => {
    fan.reconnectTimer = null;
    if (fan.destroyed) return;
    reopenFanUpstream(fan);
  }, delay);
}

function armFanUpstream(fan, upRes) {
  const gen = (fan.upstreamGen = (fan.upstreamGen || 0) + 1);
  fan.upstreamRes = upRes;
  fan.upstreamPaused = false;
  fan.reconnecting = false;
  fan.reconnectAttempts = 0;
  // Grace from arm time so stall sweep does not fire before the first chunk.
  fan.lastUpstreamByteAt = Date.now();
  if (fan.reconnectTimer) {
    clearTimeout(fan.reconnectTimer);
    fan.reconnectTimer = null;
  }
  fan.destroySrc = () => {
    try {
      upRes.destroy();
    } catch {
      /* ignore */
    }
  };
  fan.broadcasting = true;
  const onChunk = (chunk) => broadcastFanChunk(fan, chunk);
  upRes.on("data", onChunk);
  const gone = () => {
    if (fan.destroyed || fan.upstreamGen !== gen) return;
    try {
      upRes.removeListener("data", onChunk);
    } catch {
      /* ignore */
    }
    handleFanUpstreamGone(fan);
  };
  upRes.once("end", gone);
  upRes.once("error", gone);
  upRes.once("close", gone);
}

function reopenFanUpstream(fan) {
  if (fan.destroyed) return;
  const url = String(fan.primaryUpstream || "").trim();
  if (!url) {
    if (!migrateFanClientsToOfflineSplash(fan)) destroyLiveFan(fan);
    return;
  }
  // Minimal duck-typed req/res — headers already "sent" so pipeUpstream only rebinds the fan.
  const dummyReq = {
    method: "GET",
    url: "/",
    headers: {},
    once() {},
    on() {},
  };
  const dummyRes = {
    headersSent: true,
    writableEnded: false,
    write() {
      return true;
    },
    end() {
      return dummyRes;
    },
    writeHead() {
      return dummyRes;
    },
    once() {},
    on() {},
  };
  const pulseCtx = { streamId: fan.streamId, lineId: "", listenPort: 8080 };
  pipeUpstream(url, dummyReq, dummyRes, {
    live: true,
    redirectsLeft: 5,
    listenPort: 8080,
    proto: "http",
    proxy: fan.outboundProxy || null,
    altProtocolLeft: 1,
    pulseCtx,
    failovers: Array.isArray(fan.failovers) ? [...fan.failovers] : [],
    method: "GET",
    retried: false,
    fan,
    reconnect: true,
  });
}

function fanGoLive(fan, destroySrc) {
  fan.destroySrc = destroySrc;
  fan.broadcasting = true;
  fan.starterLock = false;
  fan.reconnecting = false;
  const pending = fan.waiters.splice(0, fan.waiters.length);
  for (const w of pending) attachLiveFanClient(fan, w.clientReq, w.clientRes, w.pulseCtx);
}

function rejectFanWaiters(fan, msg) {
  for (const w of fan.waiters.splice(0, fan.waiters.length)) {
    if (serveOfflineLiveSplash(w.clientReq, w.clientRes, w.pulseCtx)) continue;
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

/** Mutex: only one upstream starter per coalesced fan; concurrent zaps wait on the fan. */
function acquireLiveFanStarter(streamId, upstreamUrl) {
  const fan = ensureLiveFan(streamId, upstreamUrl);
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
  // Live-only: return HTTP 200 immediately so players do not timeout while upstream connects.
  if (!fan.onDemand && !clientRes.headersSent) {
    writeLiveTsHead(clientRes);
  }
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
      const ok = slot.clientRes.write(chunk);
      if (ok) continue;
      slot.pendingBytes = (slot.pendingBytes || 0) + chunk.length;
      if (slot.pendingBytes > MAX_CLIENT_LAG_BYTES) {
        edgeMetrics.laggedDrops += 1;
        detachHlsRemuxClient(session, slot);
      }
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
  diskPackLastAccess.delete(streamId);
}

function touchDiskPackagerAccess(streamId) {
  if (!streamId) return;
  diskPackLastAccess.set(streamId, Date.now());
}

function sweepIdleDiskPackagers() {
  killOrphanHlsFfmpeg();
  const now = Date.now();
  for (const [streamId, lastAt] of [...diskPackLastAccess.entries()]) {
    if (now - lastAt < DISK_PACK_IDLE_MS) continue;
    const proc = edgeDiskPackagers.get(streamId);
    if (!proc) {
      diskPackLastAccess.delete(streamId);
      continue;
    }
    edgeMetrics.diskPackIdleStops += 1;
    stopEdgeDiskPackager(streamId);
  }
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
  touchDiskPackagerAccess(streamId);
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

/** `/live/user/pass/...` credential prefix used to purge sibling IP auth caches on max-conn deny. */
function liveCredentialPrefix(clientReq) {
  const urlPath = String(clientReq.url || "/").split("?")[0];
  const m = urlPath.match(/^(\/live\/[^/]+\/[^/]+)\//i);
  return m ? m[1].toLowerCase() : "";
}

function purgeAuthCacheForLiveCredentials(clientReq) {
  const prefix = liveCredentialPrefix(clientReq);
  if (!prefix) return;
  for (const [key] of authCache.entries()) {
    if (String(key).toLowerCase().includes(prefix)) authCache.delete(key);
  }
}

function authPositiveTtlMs(data) {
  const maxConn = Number(data?.maxConnections) || 0;
  if (maxConn === 1) return Math.min(AUTH_CACHE_TTL_MS, AUTH_CACHE_TTL_STRICT_MS);
  return AUTH_CACHE_TTL_MS;
}

async function enforceEdgeConnSlot(data, clientReq) {
  const maxConn = Number(data?.maxConnections) || 0;
  const lineId = String(data?.lineId || "").trim();
  if (!lineId || maxConn <= 0 || !edgeSlotsEnabled()) return data;
  const slot = await edgeTryAcquireConnSlot(lineId, maxConn, {
    streamId: data.streamId,
    clientIp: clientIp(clientReq),
  });
  if (slot === "denied") {
    purgeAuthCacheForLiveCredentials(clientReq);
    return {
      ...data,
      status: 403,
      upstream: "",
      denyReason: "connections",
    };
  }
  return data;
}

function authLive(clientReq) {
  return new Promise((resolve, reject) => {
    // A direct playback LB can serve any authorized stream for the line. Use
    // the shared panel secret when available; agent tokens intentionally scope
    // a node to streams assigned to that server and would reject a line routed
    // here for a channel assigned elsewhere.
    const useAgentAuth = !INTERNAL_SECRET && Boolean(IPTV_EDGE_AGENT_TOKEN && IPTV_EDGE_SERVER_ID);
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
      // agent:false — never sit in liveAgent's queue when the panel is down/slow.
      // A saturated Agent queue does not fire request timeout until a socket is assigned,
      // which previously wedged every /live/ splice behind hung auth (thousands of ESTAB).
      const req = http.request(
        {
          hostname: backendHost,
          port: backendPort,
          path: "/api/internal/live-auth",
          method: "GET",
          agent: false,
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
            onDemand: String(res.headers["x-nexlify-on-demand"] || "") === "1",
            hlsNative: String(res.headers["x-nexlify-hls-native"] || "") === "1",
            passthrough: String(res.headers["x-nexlify-passthrough"] || "") === "1" || res.statusCode === 204,
            streamId: String(res.headers["x-nexlify-stream-id"] || ""),
            lineId: String(res.headers["x-nexlify-line-id"] || ""),
            maxConnections: Number(res.headers["x-nexlify-max-connections"] || 0) || 0,
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

function authLiveWithDeadline(clientReq) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`live-auth deadline after ${LIVE_AUTH_DEADLINE_MS}ms`));
    }, LIVE_AUTH_DEADLINE_MS);
    authLive(clientReq).then(
      (data) => {
        clearTimeout(timer);
        resolve(data);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
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
  if (hit && hit.expires > now) {
    if (hit.data?.status === 403 || hit.data?.status === 429) {
      return sanitizeAuthUpstream(hit.data);
    }
    if (hit.data?.upstream) {
      touchHlsDaemon(hit.data.streamId);
      return enforceEdgeConnSlot(sanitizeAuthUpstream(hit.data), clientReq);
    }
  }
  if (edgeRedisEnabled()) {
    const redisHit = await edgeRedisGetAuth(key);
    if (redisHit?.upstream) {
      const clean = sanitizeAuthUpstream(redisHit);
      authCache.set(key, { expires: now + authPositiveTtlMs(clean), data: clean });
      if (clean.streamId) touchHlsDaemon(clean.streamId);
      return enforceEdgeConnSlot(clean, clientReq);
    }
  }
  try {
    let data = sanitizeAuthUpstream(await authLiveWithDeadline(clientReq));
    if (data.status === 403 || data.status === 429) {
      purgeAuthCacheForLiveCredentials(clientReq);
      authCache.set(key, { expires: now + AUTH_DENY_TTL_MS, data });
      return data;
    }
    if (data.status === 200 && data.upstream) {
      data = await enforceEdgeConnSlot(data, clientReq);
      if (data.status === 403) {
        authCache.set(key, { expires: now + AUTH_DENY_TTL_MS, data });
        return data;
      }
      const ttl = authPositiveTtlMs(data);
      authCache.set(key, { expires: now + ttl, data });
      if (edgeRedisEnabled()) {
        void edgeRedisSetAuth(key, data, ttl);
      }
      pruneAuthCache(now);
      if (data.streamId) touchHlsDaemon(data.streamId);
    }
    return data;
  } catch (err) {
    if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.error(`[iptv-edge-auth] fail ${err instanceof Error ? err.message : err}`);
    }
    try {
      liveAgent.destroy();
    } catch {
      /* ignore */
    }
    return {
      status: 502,
      upstream: "",
      alts: [],
      live: false,
      onDemand: false,
      hlsNative: false,
      passthrough: false,
      streamId: "",
      lineId: "",
      outboundProxy: null,
    };
  }
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
  touchDiskPackagerAccess(streamId);
  const mem = hlsSegMemCache.get(cacheKey);
  if (mem?.buf?.length) {
    if (pulseCtx) pulseConnection(pulseCtx, mem.buf.length);
    clientRes.writeHead(200, hlsSegHeaders(mem.buf.length));
    clientRes.end(mem.buf);
    return true;
  }
  if (hlsSegInflight.has(cacheKey)) {
    edgeMetrics.hlsSegCoalesced += 1;
    const buf = await hlsSegInflight.get(cacheKey);
    if (buf?.length) {
      if (pulseCtx) pulseConnection(pulseCtx, buf.length);
      clientRes.writeHead(200, hlsSegHeaders(buf.length));
      clientRes.end(buf);
      return true;
    }
    return false;
  }
  const loadPromise = (async () => {
    if (edgeRedisEnabled()) {
      const redisBuf = await edgeRedisGetSeg(streamId, segName);
      if (redisBuf?.length) {
        hlsSegMemCache.set(cacheKey, { buf: redisBuf, at: Date.now() });
        pruneHlsSegMemCache();
        return redisBuf;
      }
    }
    const segPath = hlsSegPath(streamId, segName);
    if (!segPath) return null;
    try {
      if (!fs.existsSync(segPath)) return null;
      const buf = fs.readFileSync(segPath);
      if (!buf.length) return null;
      hlsSegMemCache.set(cacheKey, { buf, at: Date.now() });
      pruneHlsSegMemCache();
      if (edgeRedisEnabled()) void edgeRedisSetSeg(streamId, segName, buf);
      return buf;
    } catch {
      return null;
    }
  })();
  hlsSegInflight.set(cacheKey, loadPromise);
  try {
    const buf = await loadPromise;
    if (buf?.length) {
      if (pulseCtx) pulseConnection(pulseCtx, buf.length);
      clientRes.writeHead(200, hlsSegHeaders(buf.length));
      clientRes.end(buf);
      return true;
    }
    return false;
  } finally {
    if (hlsSegInflight.get(cacheKey) === loadPromise) hlsSegInflight.delete(cacheKey);
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

function pipeLiveMpegTsShared(fan, upRes, clientReq, clientRes, pulseCtx, onUnplayable, opts = {}) {
  const destroySrc = () => {
    try {
      upRes.destroy();
    } catch {
      /* ignore */
    }
  };
  const fail = (msg) => {
    if (opts.reconnect) {
      handleFanUpstreamGone(fan);
      return;
    }
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
    if (opts?.reconnect && fan.clients.size > 0) armFanKeyframeHold(fan);
    if (prefix?.length) {
      if (fan.holdUntilKeyframe) {
        // Peek bytes count toward the keyframe hold — do not leak mid-GOP to clients yet.
        if (!Array.isArray(fan.holdChunks)) fan.holdChunks = [];
        fan.holdChunks.push(prefix);
        fan.holdBytes = (fan.holdBytes || 0) + prefix.length;
        const early = releaseFanKeyframeHold(fan, false);
        if (early) {
          for (const slot of [...fan.clients]) {
            try {
              writeFanChunkToSlot(fan, slot, early);
            } catch {
              detachLiveFanClient(fan, slot);
            }
          }
        }
      } else {
        appendLiveFanPrefix(fan, prefix, true);
      }
    }
    armFanUpstream(fan, upRes);
    fanGoLive(fan, fan.destroySrc);
    if (!opts?.reconnect) {
      attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
    } else {
      const pending = fan.waiters.splice(0, fan.waiters.length);
      for (const w of pending) attachLiveFanClient(fan, w.clientReq, w.clientRes, w.pulseCtx);
    }
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

function feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx, opts = {}) {
  const peek = opts.peekPrefix;
  let earlyRelease = null;
  if (opts?.reconnect && fan.clients.size > 0) {
    armFanKeyframeHold(fan);
    if (peek?.length) {
      if (!Array.isArray(fan.holdChunks)) fan.holdChunks = [];
      fan.holdChunks.push(peek);
      fan.holdBytes = (fan.holdBytes || 0) + peek.length;
      earlyRelease = releaseFanKeyframeHold(fan, false);
    }
  } else if (peek?.length) {
    appendLiveFanPrefix(fan, peek, true);
  }
  armFanUpstream(fan, upRes);
  fanGoLive(fan, fan.destroySrc);
  if (earlyRelease) {
    for (const slot of [...fan.clients]) {
      try {
        writeFanChunkToSlot(fan, slot, earlyRelease);
      } catch {
        detachLiveFanClient(fan, slot);
      }
    }
  }
  if (!opts.reconnect) {
    attachLiveFanClient(fan, clientReq, clientRes, pulseCtx);
  } else {
    const pending = fan.waiters.splice(0, fan.waiters.length);
    for (const w of pending) attachLiveFanClient(fan, w.clientReq, w.clientRes, w.pulseCtx);
  }
}

function pipeLiveMpegTs(upRes, clientReq, clientRes, pulseCtx, onUnplayable, fan, opts = {}) {
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
  if (!opts.reconnect) {
    clientReq.once("close", () => {
      stopKickWatch();
      endPlaybackSession(pulseCtx);
    });
    clientReq.once("aborted", () => {
      stopKickWatch();
      endPlaybackSession(pulseCtx);
    });
  }
  if (!shouldSniffLiveTs(upRes)) {
    if (fan) {
      feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx, opts);
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
      feedLiveFanFromUpstream(fan, upRes, clientReq, clientRes, pulseCtx, {
        ...opts,
        peekPrefix: prefix,
      });
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

function pipeUpstream(targetUrl, clientReq, clientRes, { live, redirectsLeft, listenPort, proto, proxy, altProtocolLeft, pulseCtx, failovers, method, retried, htmlRetries = 0, fan = null, reconnect = false }) {
  const streamId = pulseCtx?.streamId || "";
  let remaining = Array.isArray(failovers) ? failovers.filter(Boolean) : [];
  if (live && remaining.length) {
    const ordered = orderLiveUpstreamTargets(streamId, targetUrl, remaining);
    targetUrl = ordered.upstream;
    remaining = ordered.failovers;
  }
  const reqMethod = String(method || clientReq.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET";
  const tryNext = (reason) => {
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
        reconnect,
      });
      return true;
    }
    if (reconnect && fan) {
      handleFanUpstreamGone(fan);
      return true;
    }
    if (live && process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1") {
      console.error(`[iptv-edge-up] live upstream failed (${reason}): ${targetUrl.slice(0, 120)}`);
    }
    // XUI-style: keep the player on a looping MPEG-TS splash instead of 502/buffer.
    if (live) {
      if (fan?.starterLock) releaseLiveFanStarter(fan, false);
      else if (fan && !fan.destroyed && (fan.clients.size > 0 || fan.waiters.length > 0)) {
        migrateFanClientsToOfflineSplash(fan);
      }
      if (!clientRes.writableEnded) return serveOfflineLiveSplash(clientReq, clientRes, pulseCtx);
      return true;
    }
    if (clientRes.headersSent) return false;
    if (fan?.starterLock) releaseLiveFanStarter(fan, false);
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
      if (fan && live) {
        try {
          const to = new URL(next);
          if (to.hostname.toLowerCase() !== parsed.hostname.toLowerCase() || /\/auth\//i.test(to.pathname)) {
            fan.authRedirectAt = Date.now();
          }
        } catch {
          /* ignore */
        }
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
        reconnect,
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
            reconnect,
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
        try {
          clientRes.writeHead(status || 502, { "content-type": "text/plain" });
        } catch {
          /* ignore */
        }
      }
      safeClientEnd(clientRes, "upstream error");
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
                reconnect,
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
      }, fan, { reconnect });
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
          reconnect,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    if (!clientRes.headersSent) {
      if (tryNext(err.message)) return;
      try {
        clientRes.writeHead(502, { "content-type": "text/plain" });
      } catch {
        /* ignore */
      }
    }
    safeClientEnd(clientRes, "upstream error");
  });
  // Fan owns the upstream socket. Do NOT destroy it when the starter client
  // closes — IPTV apps often abort the first .ts request and reopen, which
  // previously killed the shared fan for every viewer (1s play → buffer → reconnect).
  if (!(live && fan)) {
    clientReq.on("close", () => up.destroy());
  }
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
    reportViewerPlaybackDrop(clientReq, auth, `Live auth denied (HTTP ${auth.status})`, auth.status);
    denyAuth(clientRes, auth.status);
    return;
  }
  const pulseCtx =
    auth.lineId && auth.streamId
      ? {
          lineId: auth.lineId,
          streamId: auth.streamId,
          ip: clientIp(clientReq),
          hls: true,
          maxConnections: Number(auth.maxConnections) || 0,
        }
      : null;
  const isHead = String(clientReq.method || "GET").toUpperCase() === "HEAD";
  // HEAD must not stopOtherPlaybackSessions (same-IP multi-conn / in-play probes).
  if (pulseCtx && !isHead) touchPlaybackSession(pulseCtx, { hls: true });
  if (auth.passthrough || auth.status !== 200 || !auth.streamId) {
    if (!isHead) {
      reportViewerPlaybackDrop(
        clientReq,
        auth,
        auth.passthrough ? "HLS auth returned no upstream" : "HLS auth failed",
        auth.status && auth.status !== 200 ? auth.status : 502
      );
    }
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
    reportViewerPlaybackDrop(clientReq, auth, "Native HLS missing upstream URL", 502);
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
  // LibVLC / Smarters-VLC cannot play fake EVENT playlists (single unbounded .ts).
  // ExoPlayer may use that fast path; everyone else must retry or use .ts output.
  if (!userAgentAllowsInstantTsWrap(clientReq.headers["user-agent"])) {
    clientRes.writeHead(503, {
      "content-type": "text/plain",
      "retry-after": "1",
      "x-playback-hint": "mpegts",
    });
    clientRes.end("HLS not ready for this player — use MPEG-TS output");
    return;
  }
  serveInstantTsPlaylist(clientReq, clientRes, pulseCtx);
}

async function onRequest(clientReq, clientRes, ctx) {
  const pathOnly = String(clientReq.url || "/").split("?")[0];
  if (process.env.IPTV_EDGE_DEBUG_UPSTREAM === "1" && pathOnly.startsWith("/live/")) {
    console.log(`[iptv-edge-req] ${clientReq.method} ${pathOnly}`);
  }

  if (pathOnly === "/edge/health") {
    let clients = 0;
    for (const fan of uniqueLiveFans()) clients += fan.clients.size;
    clientRes.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(
      JSON.stringify({
        ok: true,
        backend: BACKEND,
        fans: uniqueLiveFanCount(),
        streamAliases: liveFans.size,
        maxFans: MAX_LIVE_FANS,
        clients,
        authCache: authCache.size,
        eventLoopLagMs: lastEventLoopLagMs,
        uptimeSec: Math.round(process.uptime()),
        offlineSplash: OFFLINE_SPLASH_ENABLED,
        offlineSplashServes: edgeMetrics.offlineSplashServes,
        offlineSplashClients: offlineSplashSessions.get(OFFLINE_SPLASH_KEY)?.clients.size || 0,
      })
    );
    return;
  }

  if (pathOnly === "/edge/prewarm") {
    const secret = clientReq.headers["x-panel-internal-secret"] || clientReq.headers["x-panel-api-key"];
    if (!INTERNAL_SECRET || String(secret || "") !== INTERNAL_SECRET) {
      clientRes.writeHead(403, { "content-type": "text/plain" });
      clientRes.end("forbidden");
      return;
    }
    const q = new URL(clientReq.url || "/", "http://local").searchParams;
    const streamId = String(q.get("streamId") || "").trim();
    if (!streamId) {
      clientRes.writeHead(400, { "content-type": "text/plain" });
      clientRes.end("streamId required");
      return;
    }
    const fan = liveFans.get(streamId);
    if (!fan || fan.destroyed || !fan.broadcasting) {
      clientRes.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      clientRes.end(JSON.stringify({ ok: false, streamId, warmed: false }));
      return;
    }
    if (fan.clients.size === 0 && fan.waiters.length === 0) {
      fan.idleSince = Date.now();
      if (fan.linger) clearTimeout(fan.linger);
      const lingerMs = fan.onDemand ? ON_DEMAND_FAN_LINGER_MS : LIVE_FAN_LINGER_MS;
      fan.linger = setTimeout(() => destroyLiveFan(fan), lingerMs);
    }
    clientRes.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(JSON.stringify({ ok: true, streamId, warmed: true }));
    return;
  }

  if (pathOnly === "/edge/drop-stream") {
    const secret = clientReq.headers["x-panel-internal-secret"] || clientReq.headers["x-panel-api-key"];
    if (!INTERNAL_SECRET || String(secret || "") !== INTERNAL_SECRET) {
      clientRes.writeHead(403, { "content-type": "text/plain" });
      clientRes.end("forbidden");
      return;
    }
    const q = new URL(clientReq.url || "/", "http://local").searchParams;
    const streamId = String(q.get("streamId") || "").trim();
    if (!streamId) {
      clientRes.writeHead(400, { "content-type": "text/plain" });
      clientRes.end("streamId required");
      return;
    }
    const fan = liveFans.get(streamId);
    if (fan) destroyLiveFan(fan);
    let authCleared = 0;
    for (const [key, hit] of authCache.entries()) {
      if (hit?.data?.streamId === streamId) {
        authCache.delete(key);
        authCleared += 1;
      }
    }
    clientRes.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(JSON.stringify({ ok: true, streamId, fanDropped: Boolean(fan), authCleared }));
    return;
  }

  if (pathOnly === "/edge/fan-stats" || pathOnly === "/edge/metrics") {
    const channels = [];
    let clients = 0;
    for (const fan of uniqueLiveFans()) {
      const n = fan.clients.size;
      clients += n;
      const lastByteAt = fan.lastUpstreamByteAt || 0;
      channels.push({
        streamId: fan.streamId,
        streamIds: fan.streamIds instanceof Set ? [...fan.streamIds] : [fan.streamId],
        upstreamKey: fan.upstreamKey || "",
        clients: n,
        broadcasting: !!fan.broadcasting,
        upstreamPaused: !!fan.upstreamPaused,
        reconnecting: !!fan.reconnecting,
        lastByteAgeMs: lastByteAt ? Math.max(0, Date.now() - lastByteAt) : null,
        upstreamBytesTotal: fan.upstreamBytesTotal || 0,
      });
    }
    const payload = {
      fans: uniqueLiveFanCount(),
      streamAliases: liveFans.size,
      maxFans: MAX_LIVE_FANS,
      clients,
      remuxSessions: edgeHlsRemuxSessions.size,
      diskPackagers: edgeDiskPackagers.size,
      hlsSegCacheEntries: hlsSegMemCache.size,
      hlsSegCacheMb: EDGE_HLS_SEG_CACHE_MB,
      metrics: { ...edgeMetrics },
      channels: channels.slice(0, 64),
    };
    clientRes.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(JSON.stringify(payload));
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

  // LG webOS / Samsung Tizen IPTV Smarters request /live/.../id.ts but cannot play
  // unbounded MPEG-TS. Serve real HLS (no 302) so the native player can start.
  if (
    PLAYBACK_RE.test(pathOnly) &&
    /^\/live\/[^/]+\/[^/]+\/[^/]+\.ts$/i.test(pathOnly) &&
    userAgentIsSmartTv(clientReq.headers["user-agent"])
  ) {
    clientReq.url = rewriteLiveTsUrlToHls(clientReq.url || pathOnly);
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
    // Deny statuses first — a 403 "Max connections" has no upstream and must not
    // fall through to forward() → misleading "media must splice locally".
    if (auth.status === 401 || auth.status === 403 || auth.status === 429 || auth.status === 404) {
      reportViewerPlaybackDrop(clientReq, auth, `Live auth denied (HTTP ${auth.status})`, auth.status);
      clientRes.writeHead(auth.status, { "content-type": "text/plain" });
      clientRes.end(
        auth.status === 401
          ? "Unauthorized"
          : auth.status === 404
            ? "Not found"
            : auth.status === 429
              ? "Too many requests"
              : "Forbidden"
      );
      return;
    }
    if (auth.passthrough || !auth.upstream) {
      // HEAD / tiny Range probes from live-auth omit upstream. Do not forward
      // /live/ to the panel (502 "must splice locally") — Smart TVs always HEAD.
      if (auth.live && (clientReq.method === "HEAD" || isTinyLiveRangeProbe(clientReq.headers.range, clientReq.headers["user-agent"]))) {
        writeLiveTsHead(clientRes);
        clientRes.end();
        return;
      }
      reportViewerPlaybackDrop(
        clientReq,
        auth,
        auth.passthrough ? "Live auth returned no upstream" : "Live auth missing upstream URL",
        auth.status && auth.status !== 200 ? auth.status : 502
      );
      // Never forward /live/ to IPTV_EDGE_BACKEND — serve offline splash (or 502 text).
      if (auth.live || /^\/(live|timeshift)\//i.test(pathOnly)) {
        serveOfflineLiveSplash(clientReq, clientRes, null);
        return;
      }
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (auth.status !== 200) {
      reportViewerPlaybackDrop(clientReq, auth, `Live auth failed (HTTP ${auth.status})`, auth.status);
      if (auth.live || /^\/(live|timeshift)\//i.test(pathOnly)) {
        serveOfflineLiveSplash(clientReq, clientRes, null);
        return;
      }
      forward(clientReq, clientRes, ctx);
      return;
    }
    const pulseCtx =
      auth.lineId && auth.streamId
        ? {
            lineId: auth.lineId,
            streamId: auth.streamId,
            ip: clientIp(clientReq),
            onDemand: Boolean(auth.onDemand),
            maxConnections: Number(auth.maxConnections) || 0,
          }
        : null;
    const isLiveRangeProbe = Boolean(
      auth.live &&
        clientReq.method !== "HEAD" &&
        isTinyLiveRangeProbe(clientReq.headers.range, clientReq.headers["user-agent"])
    );
    // Never touch sessions on HEAD / tiny Range probes — apps probe while playing and
    // stopOtherPlaybackSessions would kill the real viewer (same public IP).
    if (isLiveRangeProbe || (clientReq.method === "HEAD" && auth.live)) {
      writeLiveTsHead(clientRes);
      clientRes.end();
      return;
    }
    if (pulseCtx) touchPlaybackSession(pulseCtx);
    if (auth.live && auth.streamId && tryJoinLiveFan(auth.streamId, clientReq, clientRes, pulseCtx, auth.upstream)) {
      return;
    }
    let fan = null;
    if (auth.live && auth.streamId) {
      const acquired = acquireLiveFanStarter(auth.streamId, auth.upstream);
      if (acquired.mode === "join" && tryJoinLiveFan(auth.streamId, clientReq, clientRes, pulseCtx, auth.upstream)) {
        return;
      }
      if (acquired.mode === "wait") {
        queueLiveFanWaiter(acquired.fan, clientReq, clientRes, pulseCtx);
        return;
      }
      if (acquired.mode === "none") {
        edgeMetrics.fanCapacityRejections += 1;
        clientRes.writeHead(503, { "content-type": "text/plain", "retry-after": "5" });
        clientRes.end("edge fan capacity reached");
        return;
      }
      if (acquired.mode === "start") {
        fan = acquired.fan;
        fan.onDemand = Boolean(auth.onDemand);
        if (!auth.onDemand && !clientRes.headersSent) {
          writeLiveTsHead(clientRes);
        }
      }
    }
    const ordered = orderLiveUpstreamTargets(auth.streamId || "", auth.upstream, auth.alts || []);
    if (fan) {
      fan.primaryUpstream = ordered.upstream;
      fan.failovers = ordered.failovers || [];
      fan.outboundProxy = effectiveOutboundProxy(auth.outboundProxy);
    }
    if (auth.live && isHlsPlaybackUrl(ordered.upstream)) {
      if (fan) {
        releaseLiveFanStarter(fan, false);
        destroyLiveFan(fan);
      }
      spawnEdgeHlsToMpegTs(ordered.upstream, clientReq, clientRes, pulseCtx);
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
  killOrphanHlsFfmpeg();
  await waitForBackendReady();
  setInterval(sweepIdleDiskPackagers, DISK_PACK_IDLE_SWEEP_MS);
  setInterval(sweepIdleLiveFans, 10_000);
  setInterval(sweepStalledLiveFans, LIVE_FAN_STALL_SWEEP_MS);
  ensurePulseBatchTimer();
  // If the event loop stalls (saturated upstream / hung work), exit so PM2 restarts a fresh edge
  // instead of accepting TCP forever while /live/ never responds.
  let lastBeat = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = Math.max(0, now - lastBeat - 2000);
    lastBeat = now;
    lastEventLoopLagMs = lag;
    if (lag > 20_000) {
      console.error(`[iptv-edge] FATAL event-loop lag ${lag}ms — exiting for pm2 restart`);
      process.exit(1);
    }
  }, 2000).unref?.();
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

// A single closed-socket race must not take down every live fan on the box.
process.on("uncaughtException", (err) => {
  const code = err?.code || "";
  const msg = String(err?.message || err || "");
  if (code === "ERR_STREAM_WRITE_AFTER_END" || /write after end/i.test(msg)) {
    console.error("[iptv-edge] swallowed write-after-end (client closed early)");
    return;
  }
  console.error("[iptv-edge] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[iptv-edge] unhandledRejection:", err);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
