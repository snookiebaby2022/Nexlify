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
 *   --concurrency N       Parallel probes (default: 12, max: 32 — avoid hundreds of
 *                         simultaneous ffprobe/HTTP sockets; use a queue instead)
 *   --timeout MS          Per-request / ffprobe timeout (default: 15000; with --ffprobe
 *                         prefer 5000 via CLI or IPTV_HEALTH_TIMEOUT_MS)
 *   --max-streams N       Cap playlist entries (default: unlimited)
 *   --skip-playlist       Only run darkcdn.store CDN probes
 *   --ffprobe             Also run ffprobe for codec/resolution/bitrate (requires ffprobe)
 *   --ffprobe-bin PATH    ffprobe binary (default: ffprobe / FFPROBE_PATH)
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
const { spawn } = require("child_process");

const UA = "Nexlify-IPTV-HealthCheck/1.0";
const MAX_CONCURRENCY = 32;

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
    ffprobe: false,
    ffprobeBin: process.env.FFPROBE_PATH || "ffprobe",
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
    else if (a === "--ffprobe") out.ffprobe = true;
    else if (a === "--ffprobe-bin" && argv[i + 1]) out.ffprobeBin = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").match(/\/\*\*[\s\S]*?\*\//)?.[0] || "");
      process.exit(0);
    }
  }
  out.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(out.concurrency) || 12));
  if (out.ffprobe && !process.env.IPTV_HEALTH_TIMEOUT_MS && !argv.includes("--timeout")) {
    out.timeoutMs = 5000;
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

/** Optional media probe. Queued via mapPool — never spawn hundreds at once. */
function runFfprobe(url, timeoutMs, bin) {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,bit_rate:format=bit_rate",
      "-of",
      "json",
      "-user_agent",
      UA,
      "-analyzeduration",
      "2000000",
      "-probesize",
      "1048576",
      "-i",
      url,
    ];
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({
        ok: false,
        videoCodec: null,
        audioCodec: null,
        resolution: null,
        bitrate: null,
        error: `ffprobe timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        videoCodec: null,
        audioCodec: null,
        resolution: null,
        bitrate: null,
        error: e.message || "ffprobe spawn failed",
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout || "{}");
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const video = streams.find((s) => s.codec_type === "video");
        const audio = streams.find((s) => s.codec_type === "audio");
        const formatBr = data.format?.bit_rate ? Number(data.format.bit_rate) : null;
        const streamBr = video?.bit_rate
          ? Number(video.bit_rate)
          : audio?.bit_rate
            ? Number(audio.bit_rate)
            : null;
        const bitrate = formatBr || streamBr || null;
        const resolution =
          video?.width && video?.height ? `${video.width}x${video.height}` : null;
        const videoCodec = video?.codec_name || null;
        const audioCodec = audio?.codec_name || null;
        if (!videoCodec && !audioCodec) {
          resolve({
            ok: false,
            videoCodec,
            audioCodec,
            resolution,
            bitrate,
            error: (stderr.trim() || `ffprobe exit ${code}`).slice(0, 220),
          });
          return;
        }
        resolve({
          ok: true,
          videoCodec,
          audioCodec,
          resolution,
          bitrate,
          error: null,
        });
      } catch (e) {
        resolve({
          ok: false,
          videoCodec: null,
          audioCodec: null,
          resolution: null,
          bitrate: null,
          error: (stderr.trim() || e.message || "ffprobe parse failed").slice(0, 220),
        });
      }
    });
  });
}

async function probeStream(entry, timeoutMs, opts = {}) {
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
    videoCodec: null,
    audioCodec: null,
    resolution: null,
    bitrate: null,
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
    if (opts.ffprobe) {
      const fp = await runFfprobe(entry.url, timeoutMs, opts.ffprobeBin);
      Object.assign(result, {
        videoCodec: fp.videoCodec,
        audioCodec: fp.audioCodec,
        resolution: fp.resolution,
        bitrate: fp.bitrate,
      });
      if (fp.ok) {
        result.ok = true;
        result.error = null;
        result.kind = "ffprobe";
      } else if (!result.error) {
        result.error = fp.error;
      }
    }
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
    } else {
      result.hls = validateHlsManifest(entry.url, manifest.body);
      if (!result.hls.valid) {
        result.error = result.hls.errors.join("; ");
      } else {
        result.ok = true;
      }
    }
  } else if (/\.ts(\?|$)/i.test(entry.url) || probe.contentType.includes("mp2t")) {
    result.kind = "mpegts";
    const body = probe.body
      ? { body: probe.body }
      : await fetchUrl(entry.url, {
          method: "GET",
          timeoutMs,
          maxBytes: 4096,
          headers: { Range: "bytes=0-4095" },
        });
    const buf = Buffer.from(body.body || "", "binary");
    if (!looksLikeMpegTs(buf)) {
      result.error = "Response is not MPEG-TS (missing 0x47 sync)";
    } else {
      result.ok = true;
    }
  } else {
    result.kind = "http";
    result.ok = true;
  }

  if (opts.ffprobe) {
    const fp = await runFfprobe(entry.url, timeoutMs, opts.ffprobeBin);
    result.videoCodec = fp.videoCodec;
    result.audioCodec = fp.audioCodec;
    result.resolution = fp.resolution;
    result.bitrate = fp.bitrate;
    if (!fp.ok) {
      if (result.ok) {
        result.ok = false;
        result.error = fp.error || "ffprobe failed";
      } else if (!result.error) {
        result.error = fp.error;
      }
    }
  }

  result.latencyMs = Date.now() - started;
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    `- **ffprobe:** ${args.ffprobe ? "on" : "off"}`,
    `- **Concurrency:** ${args.concurrency} (max ${MAX_CONCURRENCY})`,
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
    lines.push(
      `| ${c.label} | ${c.ok ? "REACHABLE" : "FAIL"} (${c.status || "—"}) | ${c.latencyMs}ms | ${notes || "—"} |`
    );
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
      lines.push(
        `### ${s.name}`,
        `- **Group:** ${s.group || "—"}`,
        `- **URL:** \`${s.url}\``,
        `- **Error:** ${s.error || "unknown"}`,
        ``
      );
    }
    if (failures.length > 100) {
      lines.push(`_… and ${failures.length - 100} more failures_`, ``);
    }
  }

  lines.push(`## Working sample (first 10)`, ``);
  for (const s of streams.filter((x) => x.ok).slice(0, 10)) {
    const media = [s.videoCodec, s.audioCodec, s.resolution].filter(Boolean).join(" / ");
    lines.push(`- ${s.name} (${s.kind}, ${s.latencyMs}ms${media ? `, ${media}` : ""})`);
  }

  return { markdown: lines.join("\n"), total, working, failed, failureRate, alert };
}

function buildHtml({ args, playlistPath, streams, cdn, startedAt, finishedAt, summary }) {
  const rows = streams
    .map((s) => {
      const cls = s.ok ? "pass" : "fail";
      return `<tr class="${cls}">
  <td>${escapeHtml(s.name)}</td>
  <td>${escapeHtml(s.group || "")}</td>
  <td class="${cls}">${s.ok ? "PASS" : "FAIL"}</td>
  <td>${escapeHtml(s.kind)}</td>
  <td>${escapeHtml(s.videoCodec || "—")}</td>
  <td>${escapeHtml(s.audioCodec || "—")}</td>
  <td>${escapeHtml(s.resolution || "—")}</td>
  <td>${s.bitrate != null ? escapeHtml(String(s.bitrate)) : "—"}</td>
  <td>${s.latencyMs}ms</td>
  <td>${escapeHtml(s.error || "")}</td>
  <td><code>${escapeHtml(s.url)}</code></td>
</tr>`;
    })
    .join("\n");

  const cdnRows = cdn
    .map(
      (c) => `<tr class="${c.ok ? "pass" : "fail"}">
  <td>${escapeHtml(c.label)}</td>
  <td>${c.ok ? "REACHABLE" : "FAIL"}</td>
  <td>${c.status || "—"}</td>
  <td>${c.latencyMs}ms</td>
  <td>${escapeHtml(c.error || "")}</td>
</tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>IPTV Playlist Health ${escapeHtml(finishedAt)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #0f1419; color: #e7ecf1; }
  h1, h2 { color: #fff; }
  .meta { color: #9aa7b5; margin-bottom: 1rem; }
  .alert { color: #ff6b6b; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 1rem 0; }
  th, td { border: 1px solid #2a3540; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #1a2330; }
  tr.pass td.pass, td.pass { color: #3dd68c; }
  tr.fail td.fail, td.fail { color: #ff6b6b; }
  code { word-break: break-all; font-size: 11px; }
  .kpi { display: flex; gap: 1.5rem; margin: 1rem 0; }
  .kpi div { background: #1a2330; padding: 0.75rem 1rem; border-radius: 8px; }
</style>
</head>
<body>
  <h1>IPTV Playlist Health</h1>
  <div class="meta">
    Generated ${escapeHtml(finishedAt)} · Playlist <code>${escapeHtml(playlistPath || "(skipped)")}</code><br/>
    ffprobe: ${args.ffprobe ? "on" : "off"} · concurrency ${args.concurrency} (cap ${MAX_CONCURRENCY}) · timeout ${args.timeoutMs}ms
    ${summary.alert ? `<p class="alert">ALERT: failure rate ${summary.failureRate}% exceeds ${args.failThresholdPct}%</p>` : ""}
  </div>
  <div class="kpi">
    <div>Total <strong>${summary.total}</strong></div>
    <div>Working <strong style="color:#3dd68c">${summary.working}</strong></div>
    <div>Failed <strong style="color:#ff6b6b">${summary.failed}</strong></div>
    <div>Rate <strong>${summary.failureRate}%</strong></div>
  </div>
  <h2>CDN probes</h2>
  <table>
    <thead><tr><th>Endpoint</th><th>Reachable</th><th>HTTP</th><th>Latency</th><th>Error</th></tr></thead>
    <tbody>${cdnRows}</tbody>
  </table>
  <h2>Streams</h2>
  <table>
    <thead>
      <tr>
        <th>Channel</th><th>Group</th><th>Status</th><th>Kind</th>
        <th>Video</th><th>Audio</th><th>Resolution</th><th>Bitrate</th>
        <th>Latency</th><th>Error</th><th>URL</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
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

  const probeOpts = { ffprobe: args.ffprobe, ffprobeBin: args.ffprobeBin };
  console.log(
    `Probing ${entries.length} playlist streams (concurrency=${args.concurrency}, max=${MAX_CONCURRENCY}${args.ffprobe ? ", ffprobe=on" : ""})…`
  );
  const streams = await mapPool(entries, args.concurrency, (e) =>
    probeStream(e, args.timeoutMs, probeOpts)
  );

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
  const htmlPath = path.join(reportDir, `health-${stamp}.html`);

  const html = buildHtml({
    args,
    playlistPath: args.skipPlaylist ? "" : path.resolve(args.playlist),
    streams,
    cdn,
    startedAt,
    finishedAt,
    summary,
  });

  fs.writeFileSync(mdPath, summary.markdown, "utf8");
  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        startedAt,
        finishedAt,
        playlist: args.playlist,
        ffprobe: args.ffprobe,
        concurrency: args.concurrency,
        timeoutMs: args.timeoutMs,
        total: summary.total,
        working: summary.working,
        failed: summary.failed,
        failureRate: summary.failureRate,
        alert: summary.alert,
        cdn,
        streams: streams.map((s) => ({
          url: s.url,
          name: s.name,
          ok: s.ok,
          validityStatus: s.ok ? "valid" : "invalid",
          videoCodec: s.videoCodec,
          audioCodec: s.audioCodec,
          resolution: s.resolution,
          bitrate: s.bitrate,
          error: s.error,
          kind: s.kind,
          status: s.status,
          latencyMs: s.latencyMs,
        })),
        failures: streams.filter((s) => !s.ok).map((s) => ({ name: s.name, url: s.url, error: s.error })),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nReport: ${mdPath}`);
  console.log(`HTML:   ${htmlPath}`);
  console.log(`JSON:   ${jsonPath}`);
  console.log(
    `Total: ${summary.total} | Working: ${summary.working} | Failed: ${summary.failed} | Rate: ${summary.failureRate}%`
  );

  if (summary.alert) {
    console.error(
      `\nALERT: Failure rate ${summary.failureRate}% exceeds threshold ${args.failThresholdPct}%`
    );
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = {
  parseM3u,
  runFfprobe,
  probeStream,
  mapPool,
  MAX_CONCURRENCY,
  buildHtml,
};
