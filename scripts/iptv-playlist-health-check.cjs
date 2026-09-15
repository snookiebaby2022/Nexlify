#!/usr/bin/env node
/**
 * IPTV playlist + darkcdn.store health check.
 *
 * Usage:
 *   node scripts/iptv-playlist-health-check.cjs --playlist /path/to/playlist.m3u
 *   IPTV_HEALTH_PLAYLIST=/path/to/playlist.m3u node scripts/iptv-playlist-health-check.cjs
 *
 * Options:
 *   --playlist PATH       M3U file (or IPTV_HEALTH_PLAYLIST env)
 *   --report-dir DIR      Output directory (default: reports/iptv-health)
 *   --fail-threshold PCT  Alert when failure rate exceeds this % (default: 5)
 *   --concurrency N       Parallel probes (default: 12)
 *   --timeout MS          Per-request timeout (default: 15000)
 *   --max-streams N       Cap playlist entries (default: unlimited)
 *   --skip-playlist       Only run darkcdn.store CDN probes
 *
 * Exit codes:
 *   0 — success, failure rate at or below threshold
 *   1 — script/config error
 *   2 — failure rate above threshold (automation should alert)
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { pathToFileURL } = require("url");

const UA = "Nexlify-IPTV-HealthCheck/1.0";

const DARKCDN_ENDPOINTS = [
  { label: "Panel HTTPS", url: "https://darkcdn.store/" },
  { label: "Panel player_api", url: "https://darkcdn.store/player_api.php" },
  { label: "Media edge :8080", url: "http://209.237.141.15:8080/edge/health" },
  { label: "Live subdomain", url: "https://live.darkcdn.store/" },
];

function parseArgs(argv) {
  const out = {
    playlist: process.env.IPTV_HEALTH_PLAYLIST || "",
    reportDir: "reports/iptv-health",
    failThresholdPct: Number(process.env.IPTV_HEALTH_FAIL_THRESHOLD_PCT || 5),
    concurrency: Number(process.env.IPTV_HEALTH_CONCURRENCY || 12),
    timeoutMs: Number(process.env.IPTV_HEALTH_TIMEOUT_MS || 15000),
    maxStreams: 0,
    skipPlaylist: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--playlist" && argv[i + 1]) out.playlist = argv[++i];
    else if (a === "--report-dir" && argv[i + 1]) out.reportDir = argv[++i];
    else if (a === "--fail-threshold" && argv[i + 1]) out.failThresholdPct = Number(argv[++i]);
    else if (a === "--concurrency" && argv[i + 1]) out.concurrency = Number(argv[++i]);
    else if (a === "--timeout" && argv[i + 1]) out.timeoutMs = Number(argv[++i]);
    else if (a === "--max-streams" && argv[i + 1]) out.maxStreams = Number(argv[++i]);
    else if (a === "--skip-playlist") out.skipPlaylist = true;
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").match(/\/\*\*[\s\S]*?\*\//)?.[0] || "");
      process.exit(0);
    }
  }
  return out;
}

function attr(line, name) {
  const dq = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  if (dq?.[1] != null) return dq[1];
  const sq = line.match(new RegExp(`${name}='([^']*)'`, "i"));
  if (sq?.[1] != null) return sq[1];
  return undefined;
}

function isStreamUrlLine(line) {
  if (!line || line.startsWith("#")) return false;
  return /^(https?|rtmp|rtmps|rtsp|rtsps|udp|rtp|srt|mms|mmsh|file):\/\//i.test(line) || line.includes("://");
}

function parseM3u(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const entries = [];
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.+)$/);
      const tvgName = attr(line, "tvg-name")?.trim();
      pending = {
        name: tvgName || nameMatch?.[1]?.trim() || "Unknown",
        group: attr(line, "group-title"),
      };
      continue;
    }
    if (line.startsWith("#")) continue;
    if (pending && isStreamUrlLine(line)) {
      entries.push({ name: pending.name, group: pending.group, url: line });
      pending = null;
    }
  }
  return entries;
}

function fetchUrl(url, { method = "GET", timeoutMs = 15000, maxBytes = 65536, headers = {} } = {}) {
  return new Promise((resolve) => {
    let lib;
    try {
      lib = new URL(url).protocol === "https:" ? https : http;
    } catch (e) {
      resolve({ ok: false, status: 0, error: e.message, body: "", headers: {} });
      return;
    }
    const req = lib.request(
      url,
      {
        method,
        timeout: timeoutMs,
        headers: { "User-Agent": UA, Accept: "*/*", ...headers },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size <= maxBytes) chunks.push(c);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 400,
            status,
            error: null,
            body,
            contentType: String(res.headers["content-type"] || ""),
            headers: res.headers,
          });
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message, body: "", headers: {} }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: "timeout", body: "", headers: {} });
    });
    req.end();
  });
}

function isHlsUrl(url, contentType = "") {
  const u = url.toLowerCase();
  if (u.includes(".m3u8")) return true;
  const ct = contentType.toLowerCase();
  return ct.includes("mpegurl") || ct.includes("x-mpegurl") || ct.includes("vnd.apple.mpegurl");
}

function resolveUri(baseUrl, ref) {
  const t = String(ref || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  try {
    return new URL(t, baseUrl).toString();
  } catch {
    return t;
  }
}

function validateHlsManifest(manifestUrl, body) {
  const errors = [];
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => l.startsWith("#EXTM3U"))) {
    errors.push("Missing #EXTM3U header");
  }
  const extinf = lines.filter((l) => l.startsWith("#EXTINF:"));
  if (!extinf.length) {
    errors.push("No #EXTINF tags found");
  }
  const mediaLines = lines.filter((l) => !l.startsWith("#"));
  if (!mediaLines.length) {
    errors.push("No segment or variant URIs in manifest");
  } else {
    let bad = 0;
    for (const seg of mediaLines.slice(0, 20)) {
      const resolved = resolveUri(manifestUrl, seg);
      if (!resolved || (!/^https?:\/\//i.test(resolved) && !seg.startsWith("/"))) {
        bad++;
      }
    }
    if (bad === mediaLines.slice(0, 20).length) {
      errors.push("Segment URIs could not be resolved");
    }
  }
  return {
    valid: errors.length === 0,
    extinfCount: extinf.length,
    uriCount: mediaLines.length,
    errors,
  };
}

function looksLikeMpegTs(buf) {
  if (!buf || buf.length < 188) return false;
  let sync = 0;
  for (let i = 0; i < Math.min(buf.length, 564); i++) {
    if (buf[i] === 0x47) sync++;
  }
  return sync >= 2;
}

async function probeStream(entry, timeoutMs) {
  const started = Date.now();
  const result = {
    name: entry.name,
    group: entry.group || "",
    url: entry.url,
    darkcdn: /darkcdn\.(store|win)/i.test(entry.url),
    ok: false,
    status: 0,
    kind: "unknown",
    error: null,
    hls: null,
    latencyMs: 0,
  };

  if (!/^https?:\/\//i.test(entry.url)) {
    result.error = "Non-HTTP URL skipped";
    result.latencyMs = Date.now() - started;
    return result;
  }

  const head = await fetchUrl(entry.url, { method: "HEAD", timeoutMs, maxBytes: 0 });
  let probe = head;
  if (head.status === 405 || head.status === 501 || head.error) {
    probe = await fetchUrl(entry.url, { method: "GET", timeoutMs, maxBytes: 8192 });
  }

  result.status = probe.status;
  result.latencyMs = Date.now() - started;

  if (!probe.ok) {
    result.error = probe.error || `HTTP ${probe.status}`;
    return result;
  }

  const hls = isHlsUrl(entry.url, probe.contentType);
  if (hls) {
    result.kind = "hls";
    const manifest =
      probe.body && probe.body.includes("#EXTM3U")
        ? probe
        : await fetchUrl(entry.url, { method: "GET", timeoutMs, maxBytes: 131072 });
    if (!manifest.ok) {
      result.error = manifest.error || `Manifest fetch HTTP ${manifest.status}`;
      return result;
    }
    result.hls = validateHlsManifest(entry.url, manifest.body);
    if (!result.hls.valid) {
      result.error = result.hls.errors.join("; ");
      return result;
    }
    result.ok = true;
    return result;
  }

  if (/\.ts(\?|$)/i.test(entry.url) || probe.contentType.includes("mp2t")) {
    result.kind = "mpegts";
    const body = probe.body
      ? { body: probe.body }
      : await fetchUrl(entry.url, {
          method: "GET",
          timeoutMs,
          maxBytes: 4096,
          headers: { Range: "bytes=0-4095" },
        });
    const buf = Buffer.from(body.body || "", "utf8");
    if (!looksLikeMpegTs(buf)) {
      result.error = "Response is not MPEG-TS (missing 0x47 sync)";
      return result;
    }
    result.ok = true;
    return result;
  }

  result.kind = "http";
  result.ok = true;
  return result;
}

async function probeDarkcdnEndpoint(ep, timeoutMs) {
  const started = Date.now();
  const res = await fetchUrl(ep.url, { method: "GET", timeoutMs, maxBytes: 4096 });
  const reachable = Boolean(res.status) && !res.error;
  return {
    label: ep.label,
    url: ep.url,
    ok: reachable,
    httpOk: res.ok,
    status: res.status,
    error: res.error,
    latencyMs: Date.now() - started,
    cfRay: res.headers["cf-ray"] || null,
  };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildMarkdown({ args, playlistPath, streams, cdn, startedAt, finishedAt }) {
  const total = streams.length;
  const working = streams.filter((s) => s.ok).length;
  const failed = total - working;
  const failureRate = pct(failed, total);
  const alert = failureRate > args.failThresholdPct;

  const lines = [
    `# IPTV Playlist Health Report`,
    ``,
    `- **Generated:** ${finishedAt}`,
    `- **Playlist:** \`${playlistPath || "(skipped)"}\``,
    `- **Duration:** ${Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000)}s`,
    `- **Fail threshold:** ${args.failThresholdPct}%`,
    `- **ALERT:** ${alert ? "YES — failure rate above threshold" : "No"}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Total streams | ${total} |`,
    `| Working | ${working} |`,
    `| Failed | ${failed} |`,
    `| Failure rate | ${failureRate}% |`,
    ``,
    `## darkcdn.store CDN probes`,
    ``,
    `| Endpoint | Status | Latency | Notes |`,
    `|----------|--------|--------:|-------|`,
  ];

  for (const c of cdn) {
    const notes = [
      c.error,
      c.httpOk === false && c.ok ? "reachable (non-2xx)" : null,
      c.cfRay ? `cf-ray=${c.cfRay}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`| ${c.label} | ${c.ok ? "REACHABLE" : "FAIL"} (${c.status || "—"}) | ${c.latencyMs}ms | ${notes || "—"} |`);
  }

  const darkcdnStreams = streams.filter((s) => s.darkcdn);
  if (darkcdnStreams.length) {
    lines.push(``, `## darkcdn.store playlist streams (${darkcdnStreams.length})`, ``);
    lines.push(`| Channel | Status | Error |`, `|---------|--------|-------|`);
    for (const s of darkcdnStreams) {
      lines.push(`| ${s.name} | ${s.ok ? "OK" : "FAIL"} | ${s.error || "—"} |`);
    }
  }

  const failures = streams.filter((s) => !s.ok);
  if (failures.length) {
    lines.push(``, `## Failed streams (${failures.length})`, ``);
    for (const s of failures.slice(0, 100)) {
      lines.push(`### ${s.name}`, `- **Group:** ${s.group || "—"}`, `- **URL:** \`${s.url}\``, `- **Error:** ${s.error || "unknown"}`, ``);
    }
    if (failures.length > 100) {
      lines.push(`_… and ${failures.length - 100} more failures_`, ``);
    }
  }

  lines.push(`## Working sample (first 10)`, ``);
  for (const s of streams.filter((x) => x.ok).slice(0, 10)) {
    lines.push(`- ${s.name} (${s.kind}, ${s.latencyMs}ms)`);
  }

  return { markdown: lines.join("\n"), total, working, failed, failureRate, alert };
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();

  if (!args.skipPlaylist && !args.playlist) {
    console.error("Missing --playlist PATH (or set IPTV_HEALTH_PLAYLIST)");
    process.exit(1);
  }

  let entries = [];
  if (!args.skipPlaylist) {
    const playlistPath = path.resolve(args.playlist);
    if (!fs.existsSync(playlistPath)) {
      console.error(`Playlist not found: ${playlistPath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(playlistPath, "utf8");
    entries = parseM3u(content);
    if (args.maxStreams > 0) entries = entries.slice(0, args.maxStreams);
    console.log(`Parsed ${entries.length} streams from ${playlistPath}`);
  }

  console.log("Probing darkcdn.store endpoints…");
  const cdn = [];
  for (const ep of DARKCDN_ENDPOINTS) {
    cdn.push(await probeDarkcdnEndpoint(ep, args.timeoutMs));
  }

  console.log(`Probing ${entries.length} playlist streams (concurrency=${args.concurrency})…`);
  const streams = await mapPool(entries, args.concurrency, (e) => probeStream(e, args.timeoutMs));

  const finishedAt = new Date().toISOString();
  const summary = buildMarkdown({
    args,
    playlistPath: args.skipPlaylist ? "" : path.resolve(args.playlist),
    streams,
    cdn,
    startedAt,
    finishedAt,
  });

  const reportDir = path.resolve(args.reportDir);
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = isoStamp();
  const mdPath = path.join(reportDir, `health-${stamp}.md`);
  const jsonPath = path.join(reportDir, `health-${stamp}.json`);

  fs.writeFileSync(mdPath, summary.markdown, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        startedAt,
        finishedAt,
        playlist: args.playlist,
        ...summary,
        cdn,
        failures: streams.filter((s) => !s.ok).map((s) => ({ name: s.name, url: s.url, error: s.error })),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nReport: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);
  console.log(`Total: ${summary.total} | Working: ${summary.working} | Failed: ${summary.failed} | Rate: ${summary.failureRate}%`);

  if (summary.alert) {
    console.error(`\nALERT: Failure rate ${summary.failureRate}% exceeds threshold ${args.failThresholdPct}%`);
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
