#!/usr/bin/env node
/**
 * Tail classic-LB FFmpeg packager logs and push origin failures into panel Stream logs.
 *
 * Runs on the panel/LB host (colocated). Errors live in /var/lib/nexlify-lb/logs/*.log
 * and never reached ActivityLog before — Stream logs UI looked empty.
 *
 * Usage (cron every minute):
 *   node scripts/sync-classic-lb-packager-errors.cjs
 * Env:
 *   CLASSIC_LB_LOG_DIR=/var/lib/nexlify-lb/logs
 *   PANEL_INTERNAL_URL=http://127.0.0.1:13000
 *   PANEL_INTERNAL_SECRET=...
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

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
const LOOKBACK_BYTES = Math.max(8_192, Number(process.env.CLASSIC_LB_LOG_LOOKBACK || 65536));
const MAX_FILES = Math.max(20, Number(process.env.CLASSIC_LB_ERROR_MAX_FILES || 80));

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

const IGNORE = /Broken pipe|Error writing trailer|Error closing file|Error muxing a packet|Error submitting a packet to the muxer|append_list mode does not support/i;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { files: {} };
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
  // cmu5anma60002kvxc66spnb2l.log or 767337518.log
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
  let start = typeof prevSize === "number" && prevSize >= 0 && prevSize <= size ? prevSize : Math.max(0, size - LOOKBACK_BYTES);
  // Rotated / truncated
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

function postEvent(streamId, action, detail) {
  return new Promise((resolve) => {
    if (!SECRET) {
      console.warn("[lb-packager-errors] no PANEL_INTERNAL_SECRET — skip post");
      resolve(false);
      return;
    }
    const body = JSON.stringify({
      action,
      streamId,
      detail: `[classic-lb] ${detail}`,
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

async function main() {
  const state = loadState();
  state.files = state.files || {};
  const logs = listPackagerLogs();
  let posted = 0;
  let scanned = 0;

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
      const ok = await postEvent(streamId, ev.action, detail);
      if (ok) {
        posted++;
        console.log(
          `[${new Date().toISOString()}] lb-packager-errors stream=${streamId} action=${ev.action} ${ev.label}`
        );
      }
    }
  }

  // Prune stale cursors
  const keep = new Set(logs.map((l) => l.name));
  for (const k of Object.keys(state.files)) {
    if (!keep.has(k)) delete state.files[k];
  }
  saveState(state);
  console.log(
    `[${new Date().toISOString()}] lb-packager-errors done scanned=${scanned} posted=${posted} files=${logs.length}`
  );
}

main().catch((e) => {
  console.error("[lb-packager-errors] fatal:", e);
  process.exit(1);
});
