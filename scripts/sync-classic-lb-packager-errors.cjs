#!/usr/bin/env node
/**
 * Push classic-LB FFmpeg packager failures into panel Stream logs (ActivityLog).
 *
 * Modes (any panel install):
 *  1) Colocated: tail /var/lib/nexlify-lb/logs/*.log on this host
 *  2) Remote LBs: poll each active StreamServer's /lb/packager-errors.json
 *     (plus settings.server.classicLbConnectionsUrl / remoteLiveUpstream)
 *
 * Cron (install-streaming-stability-cron / classic-lb install / safeguards):
 *   * * * * * cd /opt/nexlify-panel && node scripts/sync-classic-lb-packager-errors.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const LOG_DIR = process.env.CLASSIC_LB_LOG_DIR || "/var/lib/nexlify-lb/logs";
const STATE_FILE =
  process.env.CLASSIC_LB_ERROR_STATE || "/var/lib/nexlify-lb/packager-error-cursor.json";
const PANEL_BASE = String(
  process.env.PANEL_INTERNAL_URL ||
    process.env.NEXLIFY_PANEL_INTERNAL_URL ||
    "http://127.0.0.1:13000"
).replace(/\/$/, "");
const SECRET =
  process.env.PANEL_INTERNAL_SECRET ||
  process.env.NEXLIFY_PANEL_API_SECRET ||
  process.env.PANEL_API_SECRET ||
  "";
const AGENT_TOKEN =
  process.env.CLASSIC_LB_AGENT_TOKEN ||
  process.env.PANEL_INTERNAL_SECRET ||
  process.env.AGENT_TOKEN ||
  SECRET ||
  "";
const LOOKBACK_BYTES = Math.max(8_192, Number(process.env.CLASSIC_LB_LOG_LOOKBACK || 65536));
const MAX_FILES = Math.max(20, Number(process.env.CLASSIC_LB_ERROR_MAX_FILES || 80));
const REMOTE_DEDUP_TTL_MS = Math.max(60_000, Number(process.env.CLASSIC_LB_ERROR_DEDUP_MS || 300_000));

/** @type {{ re: RegExp, action: string, label: string }[]} */
const RULES = [
  {
    re: /Stream ends prematurely/i,
    action: "playback_origin_fail",
    label: "upstream drop (stream ended prematurely)",
  },
  {
    re: /Will reconnect/i,
    action: "playback_origin_fail",
    label: "upstream reconnect",
  },
  {
    re: /Packet corrupt/i,
    action: "playback_stutter",
    label: "bad packet (corrupt TS)",
  },
  {
    re: /timestamp discontinuity/i,
    action: "playback_stutter",
    label: "timeline jump (timestamp discontinuity)",
  },
  {
    re: /DTS .+ out of order/i,
    action: "playback_stutter",
    label: "timeline jump (DTS out of order)",
  },
  {
    re: /Server returned 4\d\d|HTTP error|403 Forbidden|404 Not Found/i,
    action: "playback_origin_fail",
    label: "upstream HTTP error",
  },
  {
    re: /Connection refused|Connection reset|Network is unreachable|Input\/output error/i,
    action: "playback_origin_fail",
    label: "upstream I/O / connection error",
  },
];

const IGNORE =
  /Broken pipe|Error writing trailer|Error closing file|Error muxing a packet|Error submitting a packet to the muxer|append_list mode does not support/i;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { files: {}, remote: {} };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {
    console.warn("[lb-packager-errors] state write failed:", e.message || e);
  }
}

function listPackagerLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs
    .readdirSync(LOG_DIR)
    .filter((n) => n.endsWith(".log") && !n.endsWith("-mpegts.log"))
    .map((n) => {
      const full = path.join(LOG_DIR, n);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* skip */
      }
      return { name: n, full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_FILES);
}

function streamIdFromLogName(name) {
  return String(name).replace(/\.log$/i, "").replace(/-mpegts$/i, "");
}

function scanNewChunk(filePath, prevSize) {
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return { size: 0, text: "" };
  }
  const size = st.size;
  if (size <= 0) return { size: 0, text: "" };
  let start =
    typeof prevSize === "number" && prevSize >= 0 && prevSize <= size
      ? prevSize
      : Math.max(0, size - LOOKBACK_BYTES);
  if (prevSize != null && prevSize > size) start = Math.max(0, size - LOOKBACK_BYTES);
  if (size - start > LOOKBACK_BYTES * 4) start = Math.max(0, size - LOOKBACK_BYTES * 4);
  const len = size - start;
  if (len <= 0) return { size, text: "" };
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return { size, text: buf.toString("utf8") };
  } finally {
    fs.closeSync(fd);
  }
}

function classifyChunk(text) {
  /** @type {Map<string, { action: string, label: string, sample: string }>} */
  const hits = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || IGNORE.test(t)) continue;
    for (const rule of RULES) {
      if (!rule.re.test(t)) continue;
      const key = `${rule.action}|${rule.label}`;
      if (!hits.has(key)) {
        hits.set(key, { action: rule.action, label: rule.label, sample: t.slice(0, 220) });
      }
      break;
    }
  }
  return [...hits.values()];
}

function postEvent(streamId, action, detail, sourceTag) {
  return new Promise((resolve) => {
    if (!SECRET) {
      console.warn("[lb-packager-errors] no PANEL_INTERNAL_SECRET — skip post");
      resolve(false);
      return;
    }
    const tag = sourceTag ? `[classic-lb:${sourceTag}]` : "[classic-lb]";
    const body = JSON.stringify({
      action,
      streamId,
      detail: `${tag} ${detail}`,
    });
    const u = new URL(`${PANEL_BASE}/api/internal/playback-event`);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-panel-internal-secret": SECRET,
        },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204 || res.statusCode === 200);
      }
    );
    req.on("error", (e) => {
      console.warn("[lb-packager-errors] post failed:", e.message || e);
      resolve(false);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end(body);
  });
}

function eventFingerprint(streamId, action, label, sample) {
  return crypto
    .createHash("sha1")
    .update(`${streamId}|${action}|${label}|${String(sample || "").slice(0, 120)}`)
    .digest("hex");
}

function shouldPostRemote(state, fp) {
  state.remote = state.remote || {};
  const now = Date.now();
  for (const [k, ts] of Object.entries(state.remote)) {
    if (now - Number(ts) > REMOTE_DEDUP_TTL_MS) delete state.remote[k];
  }
  if (state.remote[fp] && now - Number(state.remote[fp]) < REMOTE_DEDUP_TTL_MS) {
    return false;
  }
  state.remote[fp] = now;
  return true;
}

function httpGetJson(url, headers) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      resolve({ ok: false, error: e.message || "bad_url" });
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(headers || {}),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            resolve({ ok: false, status: res.statusCode, error: raw.slice(0, 200) });
            return;
          }
          try {
            resolve({ ok: true, json: JSON.parse(raw) });
          } catch (e) {
            resolve({ ok: false, error: e.message || "json_parse" });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message || e }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

function normalizeLbOrigin(raw, preferInternalPort) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let origin = s.includes("://") ? s : `http://${s}`;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (preferInternalPort) {
    if (!u.port || ["80", "443", "8080"].includes(u.port)) u.port = "8090";
  }
  return u.origin;
}

async function discoverRemoteLbOrigins() {
  /** @type {Map<string, string>} origin -> label */
  const out = new Map();
  const add = (raw, label, preferInternal) => {
    const origin = normalizeLbOrigin(raw, preferInternal);
    if (!origin) return;
    if (!out.has(origin)) out.set(origin, label || origin);
  };

  // Always try local internal export when classic-lb is present
  if (
    fs.existsSync("/opt/nexlify-lb/php/packager_errors_export.php") ||
    fs.existsSync("/etc/nexlify-lb/lb.env")
  ) {
    add("http://127.0.0.1:8090", "local", true);
  }

  try {
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    try {
      const row = await p.panelSetting.findUnique({ where: { key: "settings.server" } });
      const server = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value || {};
      add(server.classicLbConnectionsUrl, "settings.classicLb", true);
      add(server.remoteLiveUpstream, "settings.remoteLive", true);

      const lbs = await p.streamServer.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          privateIp: true,
          domain: true,
        },
      });
      for (const lb of lbs) {
        const host =
          String(lb.privateIp || "").trim() ||
          String(lb.host || "").trim() ||
          String(lb.domain || "").trim();
        if (!host) continue;
        const port = Number(lb.port) || 8090;
        const agentPort = [80, 443, 8080].includes(port) ? 8090 : port;
        add(`http://${host}:${agentPort}`, lb.name || lb.id, false);
        if (agentPort !== 8090) add(`http://${host}:8090`, `${lb.name || lb.id}:8090`, false);
      }
    } finally {
      await p.$disconnect().catch(() => {});
    }
  } catch (e) {
    console.warn("[lb-packager-errors] discover remotes:", e.message || e);
  }

  // Env override: CLASSIC_LB_ERROR_URLS=http://a:8090,http://b:8090
  for (const part of String(process.env.CLASSIC_LB_ERROR_URLS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    add(part, "env", true);
  }

  return out;
}

async function syncLocalFiles(state) {
  const logs = listPackagerLogs();
  let posted = 0;
  let scanned = 0;
  state.files = state.files || {};

  for (const file of logs) {
    const prev = state.files[file.name];
    const prevSize = prev && typeof prev.size === "number" ? prev.size : null;
    const { size, text } = scanNewChunk(file.full, prevSize);
    state.files[file.name] = { size, mtime: file.mtime };
    if (!text) continue;
    scanned++;
    const streamId = streamIdFromLogName(file.name);
    if (!streamId || streamId.length < 4) continue;
    const events = classifyChunk(text);
    for (const ev of events) {
      const detail = `${ev.label}: ${ev.sample}`;
      const ok = await postEvent(streamId, ev.action, detail, "local");
      if (ok) {
        posted++;
        console.log(
          `[${new Date().toISOString()}] lb-packager-errors stream=${streamId} action=${ev.action} ${ev.label}`
        );
      }
    }
  }

  const keep = new Set(logs.map((l) => l.name));
  for (const k of Object.keys(state.files)) {
    if (!keep.has(k)) delete state.files[k];
  }
  return { scanned, posted, files: logs.length };
}

async function syncRemoteExports(state) {
  const origins = await discoverRemoteLbOrigins();
  let fetched = 0;
  let posted = 0;
  let failed = 0;

  for (const [origin, label] of origins) {
    // Skip local file-tail duplicate when we already scan LOG_DIR on this host
    if (
      (origin.includes("127.0.0.1") || origin.includes("localhost")) &&
      fs.existsSync(LOG_DIR)
    ) {
      continue;
    }
    const url = `${origin}/lb/packager-errors.json?bytes=${LOOKBACK_BYTES}&max=${MAX_FILES}`;
    const res = await httpGetJson(url, {
      ...(AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {}),
    });
    if (!res.ok) {
      failed++;
      console.warn(
        `[lb-packager-errors] remote ${label} ${origin} fail:`,
        res.status || res.error
      );
      continue;
    }
    fetched++;
    const events = Array.isArray(res.json?.events) ? res.json.events : [];
    for (const ev of events) {
      const streamId = String(ev.streamId || "").trim();
      const action = String(ev.action || "").trim();
      const labelText = String(ev.label || "packager error").trim();
      const sample = String(ev.sample || "").trim();
      if (!streamId || !action) continue;
      const fp = eventFingerprint(streamId, action, labelText, sample);
      if (!shouldPostRemote(state, `${origin}|${fp}`)) continue;
      const detail = `${labelText}: ${sample}`;
      const ok = await postEvent(streamId, action, detail, label);
      if (ok) {
        posted++;
        console.log(
          `[${new Date().toISOString()}] lb-packager-errors remote=${label} stream=${streamId} action=${action} ${labelText}`
        );
      }
    }
  }

  return { origins: origins.size, fetched, posted, failed };
}

async function main() {
  const state = loadState();
  const local = await syncLocalFiles(state);
  const remote = await syncRemoteExports(state);
  saveState(state);
  console.log(
    `[${new Date().toISOString()}] lb-packager-errors done local_scanned=${local.scanned} local_posted=${local.posted} local_files=${local.files} remote_origins=${remote.origins} remote_fetched=${remote.fetched} remote_posted=${remote.posted} remote_failed=${remote.failed}`
  );
}

main().catch((e) => {
  console.error("[lb-packager-errors] fatal:", e);
  process.exit(1);
});
