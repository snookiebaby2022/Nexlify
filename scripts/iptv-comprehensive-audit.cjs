#!/usr/bin/env node
/**
 * Comprehensive IPTV validation for the nexlify-panel project.
 *
 * Usage:
 *   node scripts/iptv-comprehensive-audit.cjs
 *   node scripts/iptv-comprehensive-audit.cjs --root . --ffprobe-limit 20
 *
 * Logs: .cursor/iptv-test.log
 * Report: reports/iptv-audit/audit-<timestamp>.md
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawnSync } = require("child_process");

const UA = "Nexlify-IPTV-Audit/1.0";
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cursor/projects",
  "graft",
  "marketing-drop-in/node_modules",
]);
const TEXT_EXT = new Set([
  ".m3u",
  ".m3u8",
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".md",
  ".sh",
  ".env",
  ".example",
  ".yaml",
  ".yml",
  ".conf",
  ".ps1",
]);

const DARKCDN_ENDPOINTS = [
  { label: "Panel root", url: "https://darkcdn.store/" },
  { label: "player_api.php", url: "https://darkcdn.store/player_api.php" },
  { label: "xmltv.php", url: "https://darkcdn.store/xmltv.php" },
  { label: "get.php", url: "https://darkcdn.store/get.php" },
  { label: "Media LB bladesmedia2", url: "http://bladesmedia2.darkcdn.win:8080/" },
  { label: "Edge health", url: "http://209.237.141.15:8080/edge/health" },
  { label: "Live subdomain", url: "https://live.darkcdn.store/" },
];

function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    playlist: process.env.IPTV_HEALTH_PLAYLIST || "",
    reportDir: "reports/iptv-audit",
    logFile: ".cursor/iptv-test.log",
    concurrency: 10,
    timeoutMs: 15000,
    ffprobeLimit: 15,
    ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" && argv[i + 1]) out.root = path.resolve(argv[++i]);
    else if (a === "--playlist" && argv[i + 1]) out.playlist = path.resolve(argv[++i]);
    else if (a === "--report-dir" && argv[i + 1]) out.reportDir = argv[++i];
    else if (a === "--ffprobe-limit" && argv[i + 1]) out.ffprobeLimit = Number(argv[++i]);
    else if (a === "--timeout" && argv[i + 1]) out.timeoutMs = Number(argv[++i]);
  }
  return out;
}

function logLine(logFile, msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, line, "utf8");
  process.stdout.write(line);
}

function walkFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || rel.startsWith("node_modules")) continue;
      walkFiles(full, acc);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (ext === ".m3u" || ext === ".m3u8") acc.push({ full, rel, kind: "playlist" });
    else if ([".mp4", ".mkv", ".m4v", ".mp2t"].includes(ext)) acc.push({ full, rel, kind: "local-media" });
  }
  return acc;
}

function scanTextForUrls(root, logFile) {
  const urls = new Set();
  const epgUrls = new Set();
  const darkcdn = new Set();

  function scanFile(full, rel) {
    const ext = path.extname(full).toLowerCase();
    if (!TEXT_EXT.has(ext) && !rel.includes(".env")) return;
    let text;
    try {
      if (fs.statSync(full).size > 2_000_000) return;
      text = fs.readFileSync(full, "utf8");
    } catch {
      return;
    }
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi) || []) {
      let u = m[0].replace(/[),.;`]+$/, "");
      if (/\$\{/.test(u) || u.includes("`")) continue;
      if (/example\.com|127\.0\.0\.1|localhost|nexlify\.live\/hls/i.test(u)) continue;
      if (/darkcdn\.(store|win)/i.test(u)) darkcdn.add(u);
      if (/\.m3u8?(\?|$)/i.test(u) || /\/live\/[^$]+\/[^$]+\/\d+\.(ts|m3u8)/i.test(u)) urls.add(u);
    }
    for (const m of text.matchAll(/url-tvg="([^"]+)"/gi) || []) {
      if (m[1] && /^https?:\/\//i.test(m[1])) epgUrls.add(m[1]);
    }
    for (const m of text.matchAll(/x-tvg-url="([^"]+)"/gi) || []) {
      if (m[1] && /^https?:\/\//i.test(m[1])) epgUrls.add(m[1]);
    }
  }

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        walk(full);
      } else if (ent.isFile()) {
        scanFile(full, path.relative(root, full));
      }
    }
  }
  walk(root);
  logLine(logFile, `Codebase scan: ${darkcdn.size} darkcdn URLs, ${urls.size} stream-like URLs, ${epgUrls.size} EPG refs`);
  return { urls: [...urls], darkcdn: [...darkcdn], epgUrls: [...epgUrls] };
}

function attr(line, name) {
  const dq = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  if (dq?.[1] != null) return dq[1];
  return undefined;
}

function parseM3u(content, sourceFile) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const entries = [];
  const structuralIssues = [];
  let pending = null;
  let lineNo = 0;
  let hasExtM3u = false;

  for (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTM3U")) {
      hasExtM3u = true;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      if (!/^#EXTINF:-?\d+(?:\.\d+)?(?:\s|,)/.test(line) && !/^#EXTINF:-?\d+(?:\.\d+)?\s/.test(line)) {
        structuralIssues.push({ file: sourceFile, line: lineNo, issue: "Malformed #EXTINF", detail: line.slice(0, 120) });
      }
      const nameMatch = line.match(/,(.+)$/);
      pending = {
        name: attr(line, "tvg-name") || nameMatch?.[1]?.trim() || "Unknown",
        group: attr(line, "group-title"),
        tvgId: attr(line, "tvg-id"),
        epgUrl: attr(line, "url-tvg") || attr(line, "x-tvg-url"),
        lineNo,
      };
      continue;
    }
    if (line.startsWith("#")) continue;
    if (pending) {
      if (!/^(https?|rtmp|rtsp|udp|file):\/\//i.test(line) && !line.includes("://")) {
        structuralIssues.push({ file: sourceFile, line: lineNo, issue: "Invalid stream URL", detail: line.slice(0, 120) });
      }
      entries.push({ ...pending, url: line, file: sourceFile });
      pending = null;
    } else if (/^https?:\/\//i.test(line)) {
      structuralIssues.push({ file: sourceFile, line: lineNo, issue: "URL without preceding #EXTINF", detail: line.slice(0, 120) });
    }
  }
  if (pending) {
    structuralIssues.push({ file: sourceFile, line: pending.lineNo, issue: "Missing URL after #EXTINF", detail: pending.name });
  }
  if (entries.length && !hasExtM3u) {
    structuralIssues.push({ file: sourceFile, line: 1, issue: "Missing #EXTM3U header", detail: "" });
  }
  return { entries, structuralIssues };
}

function fetchUrl(url, opts = {}) {
  const { method = "GET", timeoutMs = 15000, maxBytes = 131072, followRedirect = true } = opts;
  return new Promise((resolve) => {
    let lib;
    let parsed;
    try {
      parsed = new URL(url);
      lib = parsed.protocol === "https:" ? https : http;
    } catch (e) {
      resolve({ ok: false, status: 0, error: e.message, body: "", headers: {}, finalUrl: url, redirected: false });
      return;
    }
    const req = lib.request(
      url,
      { method, timeout: timeoutMs, headers: { "User-Agent": UA, Accept: "*/*" } },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size <= maxBytes) chunks.push(c);
        });
        res.on("end", () => {
          const status = res.statusCode || 0;
          const loc = res.headers.location;
          if (followRedirect && loc && status >= 300 && status < 400 && opts.redirectsLeft !== 0) {
            const next = new URL(loc, url).toString();
            fetchUrl(next, { ...opts, redirectsLeft: (opts.redirectsLeft ?? 5) - 1 }).then((r) =>
              resolve({ ...r, redirected: true, finalUrl: r.finalUrl || next })
            );
            return;
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            error: null,
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: String(res.headers["content-type"] || ""),
            headers: res.headers,
            finalUrl: url,
            redirected: Boolean(loc && status >= 300 && status < 400),
          });
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message, body: "", headers: {}, finalUrl: url, redirected: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: "timeout", body: "", headers: {}, finalUrl: url, redirected: false });
    });
    req.end();
  });
}

function resolveUri(base, ref) {
  try {
    return new URL(ref.trim(), base).toString();
  } catch {
    return ref;
  }
}

function validateHlsManifest(manifestUrl, body) {
  const errors = [];
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => l.startsWith("#EXTM3U"))) errors.push("Missing #EXTM3U");
  const extinf = lines.filter((l) => l.startsWith("#EXTINF:"));
  const variants = lines.filter((l) => l.startsWith("#EXT-X-STREAM-INF"));
  if (!extinf.length && !variants.length) errors.push("No #EXTINF or #EXT-X-STREAM-INF tags");
  const uris = lines.filter((l) => !l.startsWith("#"));
  if (!uris.length) errors.push("No media/segment URIs");
  return { valid: !errors.length, extinfCount: extinf.length + variants.length, uriCount: uris.length, errors, segmentUrls: uris.slice(0, 5).map((u) => resolveUri(manifestUrl, u)) };
}

function runFfprobe(ffprobePath, url, timeoutMs) {
  const r = spawnSync(
    ffprobePath,
    ["-v", "error", "-show_streams", "-of", "json", url],
    { encoding: "utf8", timeout: timeoutMs, windowsHide: true }
  );
  if (r.error) return { ok: false, error: r.error.message, video: null, audio: null };
  if (r.status !== 0) return { ok: false, error: (r.stderr || "ffprobe failed").trim().slice(0, 200), video: null, audio: null };
  try {
    const data = JSON.parse(r.stdout || "{}");
    const streams = data.streams || [];
    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");
    const h264 = video?.codec_name === "h264";
    const aac = !audio || audio.codec_name === "aac" || audio.codec_name === "mp3";
    return {
      ok: Boolean(video) && h264 && aac,
      error: !video ? "No video stream" : !h264 ? `Video codec ${video.codec_name}` : !aac ? `Audio codec ${audio?.codec_name}` : null,
      video: video?.codec_name || null,
      audio: audio?.codec_name || null,
    };
  } catch (e) {
    return { ok: false, error: e.message, video: null, audio: null };
  }
}

async function probeStream(entry, args, logFile, ffprobeBudget) {
  const t0 = Date.now();
  const result = {
    channel: entry.name,
    url: entry.url,
    file: entry.file || "(codebase ref)",
    group: entry.group || "",
    ok: false,
    errorType: "",
    errorMessage: "",
    suggestedFix: "",
    status: 0,
    latencyMs: 0,
    geoBlocked: false,
    hls: null,
    ffprobe: null,
  };

  if (!/^https?:\/\//i.test(entry.url)) {
    result.errorType = "unsupported";
    result.errorMessage = "Non-HTTP URL (skipped live probe)";
    result.suggestedFix = "Use http(s) URL for automated checks";
    return result;
  }

  logLine(logFile, `HTTP check: ${entry.name} → ${entry.url}`);
  let res = await fetchUrl(entry.url, { method: "HEAD", timeoutMs: args.timeoutMs, maxBytes: 0 });
  if (res.status === 405 || res.status === 501 || res.error) {
    res = await fetchUrl(entry.url, { method: "GET", timeoutMs: args.timeoutMs, maxBytes: 16384 });
  }
  result.status = res.status;
  result.latencyMs = Date.now() - t0;

  if (res.status === 403) {
    result.geoBlocked = true;
    result.errorType = "403";
    result.errorMessage = "Forbidden — possible geo-block or auth required";
    result.suggestedFix = "Check provider region lock or add auth headers";
    return result;
  }
  if (res.redirected && res.finalUrl !== entry.url) {
    result.errorType = "redirect";
    result.errorMessage = `Redirected to ${res.finalUrl}`;
    result.suggestedFix = "Verify redirect target is intended";
  }
  if (!res.ok) {
    result.errorType = res.error ? "timeout" : String(res.status || "http");
    result.errorMessage = res.error || `HTTP ${res.status}`;
    result.suggestedFix =
      res.status === 404 ? "Update URL — stream not found" : res.error === "timeout" ? "Check CDN/firewall" : "Verify upstream source";
    return result;
  }

  const isHls = /\.m3u8(\?|$)/i.test(entry.url) || /mpegurl/i.test(res.contentType);
  if (isHls) {
    const manifest = res.body?.includes("#EXTM3U") ? res : await fetchUrl(entry.url, { timeoutMs: args.timeoutMs });
    result.hls = validateHlsManifest(entry.url, manifest.body || "");
    if (!result.hls.valid) {
      result.errorType = "hls";
      result.errorMessage = result.hls.errors.join("; ");
      result.suggestedFix = "Fix manifest structure or upstream encoder";
      return result;
    }
    for (const segUrl of result.hls.segmentUrls.slice(0, 2)) {
      if (!/^https?:\/\//i.test(segUrl)) continue;
      const seg = await fetchUrl(segUrl, { method: "HEAD", timeoutMs: args.timeoutMs, maxBytes: 0 });
      if (!seg.ok && seg.status !== 405) {
        result.errorType = "hls-segment";
        result.errorMessage = `Segment unreachable: ${segUrl} (${seg.status || seg.error})`;
        result.suggestedFix = "Check segment CDN path or relative URI resolution";
        return result;
      }
    }
  }

  if (ffprobeBudget.remaining > 0 && /^https?:\/\//i.test(entry.url)) {
    ffprobeBudget.remaining--;
    logLine(logFile, `ffprobe: ${entry.url}`);
    result.ffprobe = runFfprobe(args.ffprobePath, entry.url, args.timeoutMs);
    if (!result.ffprobe.ok) {
      result.errorType = "codec";
      result.errorMessage = result.ffprobe.error || "Codec check failed";
      result.suggestedFix = "Ensure H.264/AAC or update transcode profile";
      return result;
    }
  }

  result.ok = true;
  return result;
}

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, worker));
  return out;
}

function findDuplicates(allEntries) {
  const byName = new Map();
  for (const e of allEntries) {
    const key = e.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(e.file);
  }
  return [...byName.entries()].filter(([, files]) => files.length > 1).map(([name, files]) => ({ name, files: [...new Set(files)], count: files.length }));
}

function suggestFix(errorType) {
  const map = {
    404: "Update URL — stream not found",
    403: "Check geo-restriction or credentials",
    timeout: "Check CDN/firewall connectivity",
    hls: "Fix HLS manifest upstream",
    codec: "Transcode to H.264/AAC",
  };
  return map[errorType] || "Review upstream source";
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date();
  fs.mkdirSync(path.dirname(args.logFile), { recursive: true });
  fs.writeFileSync(args.logFile, `=== IPTV Comprehensive Audit started ${startedAt.toISOString()} ===\n`, "utf8");

  logLine(args.logFile, `Root: ${args.root}`);
  const files = walkFiles(args.root);
  const playlistFiles = files.filter((f) => f.kind === "playlist");
  const localMedia = files.filter((f) => f.kind === "local-media");
  logLine(args.logFile, `Found ${playlistFiles.length} playlist files, ${localMedia.length} local media files`);

  const codebase = scanTextForUrls(args.root, args.logFile);
  let allEntries = [];
  const structuralIssues = [];

  for (const pf of playlistFiles) {
    const content = fs.readFileSync(pf.full, "utf8");
    const parsed = parseM3u(content, pf.rel);
    allEntries.push(...parsed.entries);
    structuralIssues.push(...parsed.structuralIssues);
    logLine(args.logFile, `Parsed ${pf.rel}: ${parsed.entries.length} entries, ${parsed.structuralIssues.length} structural issues`);
  }

  if (args.playlist && fs.existsSync(args.playlist)) {
    const content = fs.readFileSync(args.playlist, "utf8");
    const rel = path.relative(args.root, args.playlist) || args.playlist;
    const parsed = parseM3u(content, rel);
    allEntries.push(...parsed.entries);
    structuralIssues.push(...parsed.structuralIssues);
    logLine(args.logFile, `Parsed external playlist ${args.playlist}: ${parsed.entries.length} entries`);
  } else if (args.playlist) {
    logLine(args.logFile, `External playlist not found: ${args.playlist}`);
  }

  // Embedded M3U in import-parser-smoke.ts fixture (no standalone .m3u in repo)
  const smokePath = path.join(args.root, "scripts/import-parser-smoke.ts");
  if (fs.existsSync(smokePath)) {
    const smoke = fs.readFileSync(smokePath, "utf8");
    const m = smoke.match(/parseM3u\(`([\s\S]*?)`\)/);
    if (m) {
      const parsed = parseM3u(m[1], "scripts/import-parser-smoke.ts (embedded fixture)");
      allEntries.push(...parsed.entries.filter((e) => /^https?:\/\//i.test(e.url)));
      structuralIssues.push(...parsed.structuralIssues);
    }
  }

  const streamUrlsFromCode = codebase.urls
    .filter((u) => /^https?:\/\//i.test(u) && !u.includes("darkcdn.store/xmltv"))
    .slice(0, 15)
    .map((url, i) => ({ name: `Codebase ref #${i + 1}`, url, file: "(codebase scan)" }));

  // Always include discovered darkcdn stream URLs from codebase
  for (const url of codebase.darkcdn.filter((u) => /\/live\/|\.m3u8?|\.ts/i.test(u)).slice(0, 10)) {
    streamUrlsFromCode.push({ name: path.basename(url) || "darkcdn stream", url, file: "(darkcdn ref)" });
  }

  const probeTargets = [...allEntries];
  const seen = new Set(probeTargets.map((e) => e.url));
  for (const e of streamUrlsFromCode) {
    if (!seen.has(e.url)) {
      probeTargets.push(e);
      seen.add(e.url);
    }
  }

  const duplicates = findDuplicates(allEntries);
  const ffprobeBudget = { remaining: args.ffprobeLimit };

  logLine(args.logFile, `Probing ${probeTargets.length} stream URLs…`);
  const streamResults = await mapPool(probeTargets, args.concurrency, (e) =>
    probeStream(e, args, args.logFile, ffprobeBudget)
  );

  logLine(args.logFile, "Probing darkcdn CDN endpoints…");
  const cdnResults = [];
  for (const ep of DARKCDN_ENDPOINTS) {
    const t0 = Date.now();
    const res = await fetchUrl(ep.url, { timeoutMs: args.timeoutMs, maxBytes: 4096 });
    cdnResults.push({
      endpoint: ep.label,
      url: ep.url,
      ok: Boolean(res.status) && !res.error,
      httpOk: res.ok,
      status: res.status,
      latencyMs: Date.now() - t0,
      error: res.error,
      cfRay: res.headers["cf-ray"] || null,
    });
    logLine(args.logFile, `CDN ${ep.label}: ${res.status || res.error} (${Date.now() - t0}ms)`);
  }

  const epgTargets = [
    ...codebase.epgUrls,
    "https://darkcdn.store/xmltv.php",
  ].filter((v, i, a) => a.indexOf(v) === i);
  logLine(args.logFile, `EPG URL checks: ${epgTargets.length}`);
  const epgResults = [];
  for (const epgUrl of epgTargets.slice(0, 10)) {
    const res = await fetchUrl(epgUrl, { timeoutMs: args.timeoutMs, maxBytes: 8192 });
    epgResults.push({
      url: epgUrl,
      ok: res.ok || res.status === 401,
      status: res.status,
      note: res.status === 401 ? "Auth required (expected for panel EPG)" : res.error || "",
    });
  }

  const localMediaResults = [];
  for (const lm of localMedia.slice(0, 10)) {
    const fp = runFfprobe(args.ffprobePath, lm.full, args.timeoutMs);
    localMediaResults.push({ file: lm.rel, ...fp });
  }

  const working = streamResults.filter((r) => r.ok).length;
  const failed = streamResults.length - working;
  const failureRate = streamResults.length ? Math.round((failed / streamResults.length) * 1000) / 10 : 0;
  const issuesFound = failed + structuralIssues.length + cdnResults.filter((c) => !c.ok).length;
  const finishedAt = new Date();

  const md = [];
  md.push(`# IPTV Health Check Report - ${finishedAt.toISOString()}`);
  md.push("");
  md.push("## Summary");
  md.push(`- **Total Streams Scanned:** ${streamResults.length}`);
  md.push(`- **Playlist files in repo:** ${playlistFiles.length}`);
  md.push(`- **Working Streams:** ${working} (${streamResults.length ? Math.round((working / streamResults.length) * 1000) / 10 : 0}%)`);
  md.push(`- **Failed Streams:** ${failed} (${failureRate}%)`);
  md.push(`- **Structural issues:** ${structuralIssues.length}`);
  md.push(`- **Issues Found:** ${issuesFound}`);
  md.push(`- **Full log:** \`.cursor/iptv-test.log\``);
  md.push("");

  if (!playlistFiles.length) {
    md.push("> **Note:** No standalone `.m3u` / `.m3u8` files exist in this repository. Validation ran against embedded test fixtures, codebase URL references, and live darkcdn.store endpoints.");
    md.push("");
  }

  md.push("## Failed Streams (Detailed)");
  md.push("| Channel | URL | Error Type | Error Message | Suggested Fix |");
  md.push("|---------|-----|------------|---------------|---------------|");
  for (const r of streamResults.filter((x) => !x.ok)) {
    md.push(`| ${r.channel} | \`${r.url.slice(0, 80)}${r.url.length > 80 ? "…" : ""}\` | ${r.errorType} | ${r.errorMessage} | ${r.suggestedFix || suggestFix(r.errorType)} |`);
  }
  if (!streamResults.filter((x) => !x.ok).length) md.push("| — | — | — | All probed streams passed | — |");
  md.push("");

  md.push("## CDN Health");
  md.push("| darkcdn.store Endpoint | Status | Response Time | Notes |");
  md.push("|------------------------|--------|---------------|-------|");
  for (const c of cdnResults) {
    const icon = c.ok ? "✅ REACHABLE" : "❌ FAIL";
    const notes = [c.error, c.httpOk ? "" : c.ok ? "non-2xx" : "", c.cfRay ? `cf-ray=${c.cfRay}` : ""].filter(Boolean).join(" ");
    md.push(`| ${c.endpoint} | ${icon} (${c.status || "—"}) | ${c.latencyMs}ms | ${notes || "—"} |`);
  }
  md.push("");

  if (structuralIssues.length) {
    md.push("## Structural Validation Issues");
    md.push("| File | Line | Issue | Detail |");
    md.push("|------|-----:|-------|--------|");
    for (const s of structuralIssues.slice(0, 50)) {
      md.push(`| ${s.file} | ${s.line} | ${s.issue} | ${s.detail || "—"} |`);
    }
    md.push("");
  }

  if (duplicates.length) {
    md.push("## Duplicates Found");
    for (const d of duplicates) {
      md.push(`- **"${d.name}"** appears in ${d.count} entries across: ${d.files.join(", ")}`);
    }
    md.push("");
  } else {
    md.push("## Duplicates Found");
    md.push("- No duplicate channel names across parsed playlists.");
    md.push("");
  }

  md.push("## EPG Mapping");
  md.push("| EPG URL | Status | Notes |");
  md.push("|---------|--------|-------|");
  for (const e of epgResults) {
    md.push(`| \`${e.url.slice(0, 70)}${e.url.length > 70 ? "…" : ""}\` | ${e.ok ? "OK" : "FAIL"} (${e.status}) | ${e.note || "—"} |`);
  }
  md.push("");

  if (localMediaResults.length) {
    md.push("## Local Media Files (ffprobe)");
    for (const l of localMediaResults) {
      md.push(`- \`${l.file}\`: ${l.ok ? "OK" : "FAIL"} — video=${l.video || "—"} audio=${l.audio || "—"} ${l.error || ""}`);
    }
    md.push("");
  }

  md.push("## Geo-Restriction Flags");
  const geo = streamResults.filter((r) => r.geoBlocked);
  if (geo.length) {
    for (const g of geo) md.push(`- **${g.channel}**: ${g.url} (${g.errorMessage})`);
  } else md.push("- None detected in probed streams.");
  md.push("");

  md.push("## Recommendations");
  if (failed > 0) md.push(`- Fix the ${failed} failed stream(s) before next deployment`);
  if (cdnResults.some((c) => !c.ok)) md.push("- Review darkcdn.store connectivity issues (see CDN Health table)");
  if (!playlistFiles.length) md.push("- Add your production `playlist.m3u` to the repo or set `IPTV_HEALTH_PLAYLIST` for scheduled automation runs");
  if (failureRate > 5) md.push("- **Failure rate exceeds 5%** — trigger alert workflow");
  if (!failed && cdnResults.every((c) => c.ok)) md.push("- All probed infrastructure endpoints are reachable; no critical action required.");

  const reportDir = path.resolve(args.reportDir);
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = finishedAt.toISOString().replace(/[:.]/g, "-");
  const mdPath = path.join(reportDir, `audit-${stamp}.md`);
  const jsonPath = path.join(reportDir, `audit-${stamp}.json`);
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ startedAt, finishedAt, summary: { total: streamResults.length, working, failed, failureRate, issuesFound }, streamResults, cdnResults, structuralIssues, duplicates, epgResults }, null, 2),
    "utf8"
  );

  logLine(args.logFile, `Report: ${mdPath}`);
  logLine(args.logFile, `Audit complete — ${working}/${streamResults.length} streams OK, ${issuesFound} total issues`);
  console.log(`\nReport written: ${mdPath}`);

  process.exit(failureRate > 5 ? 2 : failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
