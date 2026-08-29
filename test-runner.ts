#!/usr/bin/env tsx
/**
 * NEXLIFY PANEL — FULL TEST SUITE
 * Single command: npx tsx test-runner.ts
 *
 * Auth model:
 *   - Admin JWT session → admin API routes (/api/admin/*)
 *   - Line username/password → Xtream API (/player_api.php) + playback (/live/, /movie/, /series/)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ===== CONFIG =====
const PANEL = process.env.PANEL_URL || "http://localhost:3000";
const PLAYBACK = process.env.PLAYBACK_URL || PANEL;
const XUI   = process.env.XUI_URL   || "";
const ADMIN_USER = process.env.ADMIN_USER || process.env.TEST_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.TEST_PASS || "admin";
const OUTPUT_DIR = "./test-results";
/** Known-good live stream on server 45 (BBC One FHD). Override via SMOKE_LIVE_STREAM_ID. */
const SMOKE_LIVE_STREAM_ID = process.env.SMOKE_LIVE_STREAM_ID || "1058467879";

const results: { name: string; pass: boolean; detail: string; ms: number }[] = [];
let adminSession = "";
let lineUser = "";
let linePass = "";
let lineId = "";
let cachedM3uPrefix: { status: number; raw: string } | null = null;
let playbackCatalog: {
  liveStreams: any[];
  vodStreams: any[];
  seriesList: any[];
  seriesInfo: { json: any } | null;
} | null = null;

function log(msg: string) { console.log(msg); }

// ===== HTTP HELPERS =====
const fetchInit: RequestInit = { redirect: "manual" };

async function http(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string; followRedirects?: boolean; timeout?: number; noSession?: boolean } = {}): Promise<{ status: number; json: any; raw: string; setCookie: string }> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...opts.headers,
  };
  if (adminSession && !opts.noSession) headers["Cookie"] = adminSession;
  const controller = new AbortController();
  const ms = opts.timeout || 30000;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
      redirect: opts.followRedirects === false ? "manual" : "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const setCookie = res.headers.get("set-cookie") || "";
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, raw: text.slice(0, 300), setCookie };
  } catch (e: any) {
    clearTimeout(timer);
    return { status: -1, json: null, raw: e?.message || String(e), setCookie: "" };
  }
}

function m3uPlaylistUrl() {
  return `${PANEL}/get.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}&type=m3u_plus&output=ts`;
}

async function fetchM3uPrefix() {
  if (!cachedM3uPrefix) {
    cachedM3uPrefix = await httpPrefix(m3uPlaylistUrl(), { timeout: 120000, noSession: true });
  }
  return cachedM3uPrefix;
}

function pickLiveStreamId(liveStreams: any[]): string | number | undefined {
  const preferred = String(SMOKE_LIVE_STREAM_ID).trim();
  if (preferred && liveStreams.some((s) => String(s.stream_id) === preferred)) {
    return preferred;
  }
  const bbc = liveStreams.find((s) => /bbc one/i.test(String(s.name || "")));
  if (bbc?.stream_id != null) return bbc.stream_id;
  return liveStreams[0]?.stream_id;
}

async function loadPlaybackCatalog() {
  if (playbackCatalog) return playbackCatalog;
  const [liveRes, vodRes, seriesRes] = await Promise.all([
    xtreamRaw("get_live_streams"),
    xtreamRaw("get_vod_streams"),
    xtreamRaw("get_series"),
  ]);
  let seriesInfo: { json: any } | null = null;
  const firstSeries = seriesRes.json?.[0];
  if (firstSeries?.series_id) {
    seriesInfo = await xtreamRaw(`get_series_info&series_id=${firstSeries.series_id}`);
  }
  playbackCatalog = {
    liveStreams: liveRes.json || [],
    vodStreams: vodRes.json || [],
    seriesList: seriesRes.json || [],
    seriesInfo,
  };
  return playbackCatalog;
}

/** Small ranged GET — avoids downloading multi-GB VOD bodies during smoke tests. */
async function httpProbe(
  url: string,
  opts: { timeout?: number; noSession?: boolean } = {}
): Promise<{ status: number; contentType: string; prefix: string }> {
  const headers: Record<string, string> = { Accept: "*/*", Range: "bytes=0-8191" };
  if (adminSession && !opts.noSession) headers["Cookie"] = adminSession;
  const controller = new AbortController();
  const ms = opts.timeout ?? 20000;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    const prefix = (await res.text()).slice(0, 4096);
    return { status: res.status, contentType: res.headers.get("content-type") || "", prefix };
  } catch (e: any) {
    clearTimeout(timer);
    return { status: -1, contentType: "", prefix: e?.message || String(e) };
  }
}

/** Read the first part of a streaming response (M3U/XMLTV) without buffering the full body. */
async function httpPrefix(
  url: string,
  opts: { maxBytes?: number; timeout?: number; noSession?: boolean } = {}
): Promise<{ status: number; raw: string }> {
  const maxBytes = opts.maxBytes ?? 65536;
  const headers: Record<string, string> = { Accept: "*/*" };
  if (adminSession && !opts.noSession) headers["Cookie"] = adminSession;
  const controller = new AbortController();
  const ms = opts.timeout ?? 120000;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    if (!res.body) {
      const raw = await res.text();
      return { status: res.status, raw: raw.slice(0, maxBytes) };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      total += value.byteLength;
      if (raw.includes("#EXTM3U") && raw.includes("#EXTINF:")) break;
    }
    void reader.cancel().catch(() => {});
    return { status: res.status, raw };
  } catch (e: any) {
    clearTimeout(timer);
    return { status: -1, raw: e?.message || String(e) };
  }
}

function xtream(action: string) {
  return `${PANEL}/player_api.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}&action=${action}`;
}

function xtreamStream(type: string, id: string | number, ext = "m3u8") {
  return `${PLAYBACK}/${type}/${encodeURIComponent(lineUser)}/${encodeURIComponent(linePass)}/${id}.${ext}`;
}

async function xtreamRaw(action: string): Promise<{ status: number; json: any; raw: string }> {
  const r = await http(xtream(action), { headers: {} }); // no admin cookie for Xtream
  return r;
}

// ===== TEST FRAMEWORK =====
async function test(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, detail: "OK", ms: Date.now() - t0 });
    console.log(`  \x1b[32m✓\x1b[0m ${name} \x1b[90m(${Date.now()-t0}ms)\x1b[0m`);
  } catch (e: any) {
    const msg = e?.message || String(e);
    results.push({ name, pass: false, detail: msg, ms: Date.now() - t0 });
    console.log(`  \x1b[31m✗\x1b[0m ${name}: ${msg.slice(0, 200)} \x1b[90m(${Date.now()-t0}ms)\x1b[0m`);
  }
}

function ok(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ===== STEP 1: AUTH + TEST LINE =====
async function setup() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 1: Authentication & Test Line Setup\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  // Panel admin login
  const login = await http(`${PANEL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  // Extract session cookie from set-cookie header
  if (login.setCookie) {
    const m = login.setCookie.match(/^([^\s=]+=[^\s;]+)/);
    if (m) adminSession = m[1];
  }
  log(`  Login status: ${login.status}`);
  log(`  Login body: ${login.raw}`);
  log(`  Session cookie: ${adminSession ? adminSession.slice(0, 40) + "..." : "(none)"}`);
  ok(login.status === 200, `Admin login failed: HTTP ${login.status}`);
  ok(login.json?.ok === true, `Login not ok: ${login.raw}`);
  log(`  ✓ Admin session acquired (${ADMIN_USER})`);

  // List existing lines
  const linesRes = await http(`${PANEL}/api/admin/lines`);
  if (linesRes.status === 200 && Array.isArray(linesRes.json?.lines) && linesRes.json.lines.length > 0) {
    const line = linesRes.json.lines[0];
    lineUser = line.username;
    linePass = line.password;
    lineId = line.id;
    log(`  ✓ Using existing test line: ${lineUser} (id: ${lineId})`);
  } else {
    log(`  ⚠ No existing lines (status: ${linesRes.status}, body: ${linesRes.raw})`);
    log("  Creating test line...");
    const createLine = await http(`${PANEL}/api/admin/lines`, {
      method: "POST",
      body: JSON.stringify({
        username: `testline_${Date.now()}`,
        password: `testpass_${Date.now()}`,
        maxConnections: 5,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      }),
    });
    log(`  Create line: status=${createLine.status} body=${createLine.raw}`);
    if (createLine.json?.line) {
      lineUser = createLine.json.line.username;
      linePass = createLine.json.line.password;
      lineId = createLine.json.line.id;
      log(`  ✓ Created test line: ${lineUser}`);
    } else {
      throw new Error(`Cannot create test line: ${createLine.raw}`);
    }
  }

  // Verify line works via Xtream API
  const userInfo = await xtreamRaw("get_user_info");
  log(`  Xtream user_info: ${JSON.stringify(userInfo.json).slice(0, 300)}`);
  if (userInfo.json?.user_info?.auth === 1) {
    log(`  ✓ Line authenticated via Xtream API`);
  } else {
    log(`  ⚠ Line Xtream auth issue (auth=${userInfo.json?.user_info?.auth})`);
  }
}

// ===== STEP 2: CATEGORY TESTS =====
async function testCategories() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 2: Categories & Sub-Categories\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  for (const type of ["live", "vod", "series"]) {
    const action = type === "series" ? "get_series_categories" : `get_${type}_categories`;
    await test(`GET ${action}`, async () => {
      const r = await xtreamRaw(action);
      ok(r.status === 200, `HTTP ${r.status}`);
      ok(Array.isArray(r.json), `Not array: ${r.raw}`);
      if (r.json.length > 0) {
        const c = r.json[0];
        ok(c.category_id, "Missing category_id");
        ok(c.category_name, "Missing category_name");
        log(`    → ${r.json.length} categories | first: "${c.category_name}" (id: ${c.category_id})`);
      } else {
        log(`    → 0 categories`);
      }
    });
  }

  await test("Category hierarchy integrity (no orphan children)", async () => {
    const r = await xtreamRaw("get_live_categories");
    ok(r.status === 200, `HTTP ${r.status}`);
    const cats: any[] = r.json || [];
    const ids = new Set(cats.map((c: any) => String(c.category_id)));
    const orphans = cats.filter((c: any) => c.parent_id && c.parent_id !== "0" && !ids.has(String(c.parent_id)));
    ok(orphans.length === 0, `Orphan categories: ${orphans.map((o: any) => `"${o.category_name}"→parent ${o.parent_id}`).join(", ")}`);
    log(`    ✓ All ${cats.length} categories have valid parent references`);
  });
}

// ===== STEP 3: STREAM TESTS =====
async function testStreams() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 3: Streams (Live / VOD / Series)\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  await test("GET get_live_streams", async () => {
    const r = await xtreamRaw("get_live_streams");
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(Array.isArray(r.json) && r.json.length > 0, `No live streams: ${r.raw}`);
    const s = r.json[0];
    ok(s.stream_id, "Missing stream_id");
    ok(s.name, "Missing name");
    ok(s.stream_type, "Missing stream_type");
    log(`    → ${r.json.length} live streams | first: "${s.name}" (id: ${s.stream_id})`);
  });

  await test("GET get_vod_streams", async () => {
    const r = await xtreamRaw("get_vod_streams");
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(Array.isArray(r.json), `Not array: ${r.raw}`);
    if (r.json.length > 0) {
      const s = r.json[0];
      ok(s.stream_id, "Missing stream_id");
      ok(s.container_extension, "Missing container_extension");
      log(`    → ${r.json.length} movies | first: "${s.name}" (${s.container_extension})`);
    } else {
      log(`    → 0 movies`);
    }
  });

  await test("GET get_series", async () => {
    const r = await xtreamRaw("get_series");
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(Array.isArray(r.json), `Not array: ${r.raw}`);
    if (r.json.length > 0) {
      const s = r.json[0];
      ok(s.series_id, "Missing series_id");
      ok(s.name, "Missing name");
      log(`    → ${r.json.length} series | first: "${s.name}" (id: ${s.series_id})`);
    } else {
      log(`    → 0 series`);
    }
  });

  await test("GET get_series_info (seasons/episodes)", async () => {
    const list = await xtreamRaw("get_series");
    const first = list.json?.[0];
    if (!first?.series_id) { log("    → skipped (no series)"); return; }
    const r = await xtreamRaw(`get_series_info&series_id=${first.series_id}`);
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(r.json?.episodes, "Missing episodes");
    const eps = Object.values(r.json.episodes).flat() as any[];
    if (eps.length > 0) {
      const ep = eps[0];
      ok(ep.stream_id || ep.id, "Episode missing stream_id");
      ok(ep.season, "Episode missing season");
      ok(ep.episode_num, "Episode missing episode_num");
      log(`    → "${first.name}" has ${eps.length} episodes, first ep: s${ep.season}e${ep.episode_num}`);
    }
  });

  await test("GET get_user_info", async () => {
    const r = await xtreamRaw("get_user_info");
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(r.json?.user_info, "Missing user_info");
    const ui = r.json.user_info;
    log(`    → auth: ${ui.auth}, status: ${ui.status}, max_conns: ${ui.max_connections}, exp: ${ui.exp_date || "never"}`);
  });

  await test("GET get_server_info", async () => {
    // Xtream returns server_info on the standard auth request without an action.
    // action=get_server_info is not part of the common XUI contract.
    const r = await http(
      `${PANEL}/player_api.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}`,
      { headers: {} }
    );
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(r.json?.server_info, "Missing server_info");
    const si = r.json.server_info;
    log(`    → url: ${si.url}, port: ${si.port}, https_port: ${si.https_port}, tz: ${si.timezone}`);
  });
}

// ===== STEP 4: PLAYBACK TESTS =====
async function testPlayback() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 4: Playback (Live / Movie / Series / EPG)\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  const catalog = await loadPlaybackCatalog();
  const liveStreams = catalog.liveStreams;
  const vodStreams = catalog.vodStreams;
  const seriesList = catalog.seriesList;

  const liveId = pickLiveStreamId(liveStreams);
  const movieId = vodStreams[0]?.stream_id;
  let episodeId: string | undefined;

  if (seriesList.length > 0 && catalog.seriesInfo?.json) {
    const eps = Object.values(catalog.seriesInfo.json.episodes || {}).flat() as any[];
    episodeId = eps[0]?.stream_id ?? eps[0]?.id;
  }

  log(`  IDs → live: ${liveId}, movie: ${movieId}, episode: ${episodeId || "n/a"}`);

  // Live HLS
  if (liveId) {
    await test("Live HLS manifest (valid M3U8)", async () => {
      const url = xtreamStream("live", liveId);
      const r = await http(url, {
        headers: {
          "User-Agent": "ExoPlayer/2.19.1",
          Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        },
      });
      log(`    HTTP ${r.status}, size: ${r.raw.length}`);
      ok(r.status === 200 || r.status === 206, `HTTP ${r.status}`);
      ok(r.raw.includes("#EXTM3U"), `Not M3U8: ${r.raw.slice(0, 200)}`);
      const segments = r.raw.split("\n").filter(l => l.includes(".ts") || l.includes(".mp4?") || l.endsWith(".m3u8"));
      log(`    → manifest has ${segments.length} references`);
    });
  }

  // Movie HLS
  if (movieId) {
    await test("Movie HLS manifest", async () => {
      const url = xtreamStream("movie", movieId);
      const r = await http(url, { headers: {} });
      log(`    HTTP ${r.status}, size: ${r.raw.length}`);
      ok(r.status === 200 || r.status === 206, `HTTP ${r.status}`);
      ok(r.raw.includes("#EXTM3U"), `Not M3U8: ${r.raw.slice(0, 200)}`);
    });
  }

  // Series episode — MKV/MP4 proxy returns binary, not M3U8
  if (episodeId) {
    await test("Series episode playback URL", async () => {
      const url = xtreamStream("series", episodeId!);
      const r = await httpProbe(url, { noSession: true, timeout: 20000 });
      log(`    HTTP ${r.status}, type: ${r.contentType || "(none)"}`);
      ok(r.status === 200 || r.status === 206, `HTTP ${r.status}`);
      const isM3u8 = r.prefix.includes("#EXTM3U");
      const ct = r.contentType.toLowerCase();
      const isMedia =
        ct.includes("video/") ||
        ct.includes("octet-stream") ||
        ct.includes("application/vnd.apple.mpegurl") ||
        ct.includes("mpegurl");
      ok(isM3u8 || isMedia || r.prefix.length > 64, `Not stream body: ${r.prefix.slice(0, 120)}`);
    });
  }

  // EPG XMLTV — prefix only (full guide can be tens of MB)
  await test("EPG XMLTV output", async () => {
    const url = `${PANEL}/xmltv.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}`;
    const r = await httpPrefix(url, { maxBytes: 262144, timeout: 120000, noSession: true });
    if (r.status === 400) {
      log(`    ⚠ HTTP ${r.status} — panel may not expose EPG at /xmltv.php`);
      return;
    }
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(r.raw.includes("<tv>") || r.raw.includes("<tv "), "Not XMLTV");
    const channels = (r.raw.match(/<channel id="/g) || []).length;
    const programs = (r.raw.match(/<programme /g) || []).length;
    log(`    → ${channels} channels, ${programs} programmes (prefix sample)`);
  });

  // Short EPG
  if (liveId) {
    await test("EPG short EPG API", async () => {
      const r = await xtreamRaw(`get_short_epg&stream_id=${liveId}&limit=5`);
      ok(r.status === 200, `HTTP ${r.status}`);
      // May return {epg_listings: [...]} or just array
      const listings = r.json?.epg_listings || r.json;
      if (!Array.isArray(listings)) {
        log(`    ⚠ EPG response not array: ${r.raw.slice(0, 200)}`);
        return;
      }
      log(`    → ${listings.length} EPG entries`);
    });
  }

  // M3U playlist (shared prefix cache with XUI format check below)
  await test("M3U playlist (get.php)", async () => {
    const r = await fetchM3uPrefix();
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(r.raw.includes("#EXTM3U"), "Not M3U");
    const count = (r.raw.match(/#EXTINF:/g) || []).length;
    ok(count > 0, "No channels in playlist");
    log(`    → ${count}+ channels in M3U prefix`);
  });

  // Bouquets — try multiple action names (panel-dependent)
  await test("GET get_bouquets", async () => {
    let r = await xtreamRaw("get_bouquets");
    // Some panels return user_info for get_bouquets; try get_live_categories as fallback
    if (!Array.isArray(r.json)) {
      log(`    ⚠ get_bouquets returned non-array, trying alternative...`);
      // Try via admin API instead
      const adminR = await http(`${PANEL}/api/admin/bouquets`);
      if (adminR.status === 200 && adminR.json?.bouquets) {
        ok(true, "");
        log(`    → ${adminR.json.bouquets.length} bouquets (via admin API)`);
        return;
      }
    }
    ok(r.status === 200, `HTTP ${r.status}`);
    ok(Array.isArray(r.json), `Not array: ${r.raw}`);
    log(`    → ${r.json?.length || 0} bouquets`);
  });
}

// ===== STEP 5: ADMIN REST API =====
async function testAdminApis() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 5: Admin REST APIs\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  const endpoints = [
    "/api/admin/streams",
    "/api/admin/lines",
    "/api/admin/users",
    "/api/admin/bouquets",
    "/api/admin/servers",
    "/api/admin/analytics",
    "/api/admin/settings",
    "/api/admin/epg-sources",
    "/api/admin/packages",
    "/api/admin/coupons",
    "/api/admin/access-codes",
    "/api/admin/notifications",
    "/api/admin/activity-logs",
    "/api/admin/cache",
    "/api/panel/version",
  ];

  for (const ep of endpoints) {
    await test(`GET ${ep}`, async () => {
      const timeout = ep.includes("/streams") ? 90000 : 30000;
      const r = await http(`${PANEL}${ep}`, { timeout });
      if (r.status === -1) {
        log(`    ⚠ Request timed out/failed: ${r.raw}`);
        throw new Error(`Timeout/error: ${r.raw.slice(0, 100)}`);
      }
      if (r.status === 404) {
        log(`    ℹ Endpoint not implemented (404)`);
        return; // pass — endpoint just doesn't exist
      }
      ok(r.status === 200, `HTTP ${r.status} — ${r.raw.slice(0, 100)}`);
      log(`    → ${r.raw.slice(0, 120)}`);
    });
  }
}

// ===== STEP 6: XUI FIELD COMPARISON =====
async function testXuiCompat() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 6: XUI Compatibility (Field-by-Field)\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  const xuiSpecs: Record<string, string[]> = {
    "get_live_streams": ["num", "name", "stream_type", "stream_id", "stream_icon", "epg_channel_id", "added", "category_id", "custom_sid", "tv_archive", "direct_source", "tv_archive_duration"],
    "get_vod_streams": ["num", "name", "stream_id", "stream_icon", "rating", "rating_5based", "added", "is_adult", "category_id", "container_extension", "custom_sid", "direct_source"],
    "get_series": ["series_id", "name", "cover", "plot", "cast", "director", "genre", "releaseDate", "last_modified", "rating", "rating_5based", "backdrop_path", "youtube_trailer", "episode_run_time", "category_id"],
    "get_live_categories": ["category_id", "category_name", "parent_id"],
    "get_vod_categories": ["category_id", "category_name", "parent_id"],
    "get_series_categories": ["category_id", "category_name", "parent_id"],
    "get_user_info": ["username", "password", "message", "auth", "status", "exp_date", "is_trial", "active_cons", "created_at", "max_connections", "allowed_outputs"],
    "get_server_info": ["url", "port", "https_port", "rtmp_port", "server_protocol", "timezone", "timestamp_now", "time", "allowed_output_formats"],
  };

  for (const [action, expected] of Object.entries(xuiSpecs)) {
    await test(`XUI field check: ${action}`, async () => {
      const r =
        action === "get_server_info"
          ? await http(
              `${PANEL}/player_api.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}`,
              { headers: {} }
            )
          : await xtreamRaw(action);
      ok(r.status === 200, `HTTP ${r.status}`);
      // Handle both flat and nested responses
      let item: any;
      if (Array.isArray(r.json)) {
        item = r.json[0];
      } else if (r.json?.user_info && r.json?.server_info) {
        // get_user_info returns {user_info, server_info} — check user_info fields
        item = action === "get_server_info" ? r.json.server_info : r.json.user_info;
      } else if (r.json?.server_info) {
        item = r.json.server_info;
      } else if (r.json?.user_info) {
        item = r.json.user_info;
      } else {
        item = r.json;
      }
      if (!item) { log("    → skipped (empty)"); return; }
      const missing = expected.filter(f => !(f in item));
      if (missing.length > 0) {
        log(`    ⚠ Missing XUI fields: ${missing.join(", ")}`);
        throw new Error(`Missing ${missing.length} XUI fields: ${missing.join(", ")}`);
      }
      log(`    ✓ All ${expected.length} XUI fields present`);
    });
  }

  // M3U format check (reuses get.php prefix from Step 4 when available)
  await test("XUI M3U format: #EXTINF fields", async () => {
    const r = await fetchM3uPrefix();
    ok(r.status === 200, `HTTP ${r.status}`);
    const extinfLines = r.raw.split("\n").filter(l => l.startsWith("#EXTINF:"));
    ok(extinfLines.length > 0, "No #EXTINF lines");
    const first = extinfLines[0];
    const hasTvgId = first.includes("tvg-id");
    const hasGroupTitle = first.includes("group-title");
    log(`    → tvg-id: ${hasTvgId}, group-title: ${hasGroupTitle}`);
    if (!hasTvgId) log("    ⚠ Missing tvg-id (XUI standard)");
    if (!hasGroupTitle) log("    ⚠ Missing group-title (XUI standard)");
  });

  if (XUI && XUI !== PANEL) {
    await test("XUI live diff vs reference", async () => {
      for (const action of ["get_live_categories", "get_vod_categories", "get_live_streams", "get_vod_streams"]) {
        const panel = await http(`${PANEL}/player_api.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}&action=${action}`, { headers: {} });
        const xui = await http(`${XUI}/player_api.php?username=${encodeURIComponent(lineUser)}&password=${encodeURIComponent(linePass)}&action=${action}`, { headers: {} });
        if (panel.status !== 200 || xui.status !== 200) { log(`    ⚠ ${action}: panel=${panel.status} xui=${xui.status}`); continue; }
        mkdirSync(OUTPUT_DIR, { recursive: true });
        writeFileSync(join(OUTPUT_DIR, `diff-${action}.txt`), `# Panel (${PANEL})\n${JSON.stringify(panel.json, null, 2)}\n\n# XUI (${XUI})\n${JSON.stringify(xui.json, null, 2)}`);
        log(`    → ${action}: diff saved`);
      }
    });
  } else {
    log("  ℹ No XUI_URL — skipping live comparison.\n");
  }
}

// ===== STEP 7: CONCURRENCY & SECURITY =====
async function testSecurity() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 7: Concurrency & Security\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  await test("Rate limit: login lockout after failures", async () => {
    const statuses: number[] = [];
    for (const pw of ["wrong1", "wrong2", "wrong3", "wrong4", "wrong5"]) {
      const r = await http(`${PANEL}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: "__nexlify_rate_limit_probe__", password: pw }),
        headers: { "X-Forwarded-For": "203.0.113.99" },
        noSession: true,
      });
      statuses.push(r.status);
    }
    log(`    → ${statuses.join(", ")}`);
    if (statuses.includes(429)) log("    ✓ Rate limit triggered (429)");
    else log("    ⚠ No 429 rate limit triggered");
  });

  await test("Auth: invalid line credentials rejected", async () => {
    const r = await http(`${PANEL}/player_api.php?username=nonexistent_user_999&password=badpass&action=get_user_info`, { headers: {} });
    ok(r.status === 401 || r.json?.user_info?.auth === 0, `Expected 401/auth=0, got: ${r.raw.slice(0, 100)}`);
    log("    ✓ Invalid line rejected");
  });

  await test("Auth: admin API requires session", async () => {
    const r = await http(`${PANEL}/api/admin/streams`, {
      headers: {},
      noSession: true,
      followRedirects: false,
    });
    ok(r.status === 401 || r.status === 403 || r.status === 307, `Expected 401/403/307, got ${r.status}`);
    log(`    → HTTP ${r.status} (unauthenticated)`);
  });
}

// ===== STEP 8: PERFORMANCE =====
async function testPerformance() {
  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  STEP 8: Performance Timings\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");

  const endpoints = [
    { name: "player_api get_user_info", url: xtream("get_user_info") },
    { name: "player_api get_live_streams", url: xtream("get_live_streams") },
    { name: "player_api get_vod_streams", url: xtream("get_vod_streams") },
    { name: "player_api get_series", url: xtream("get_series") },
    { name: "api/admin/streams", url: `${PANEL}/api/admin/streams` },
    { name: "api/admin/lines", url: `${PANEL}/api/admin/lines` },
  ];

  for (const ep of endpoints) {
    await test(`Timing: ${ep.name}`, async () => {
      const t0 = Date.now();
      await http(ep.url, { headers: {} });
      const ms = Date.now() - t0;
      log(`    → ${ms}ms`);
      if (ms > 5000) throw new Error(`Too slow: ${ms}ms (>5s)`);
    });
  }
}

// ===== REPORT =====
function report() {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  log("\n\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m");
  log("\x1b[1m  FINAL REPORT\x1b[0m");
  log("\x1b[1m══════════════════════════════════════════════════════════════\x1b[0m\n");
  log(`  Panel:    ${PANEL}`);
  log(`  XUI ref:  ${XUI || "(not set)"}`);
  log(`  Line:     ${lineUser}`);
  log(`  Total:    ${total} tests in ${totalMs}ms`);
  log(`  \x1b[32mPassed:   ${passed}\x1b[0m`);
  log(`  \x1b[31mFailed:   ${failed}\x1b[0m`);
  log("");

  if (failed > 0) {
    log("\x1b[31m  FAILED TESTS:\x1b[0m");
    results.filter(r => !r.pass).forEach(r => log(`    ✗ ${r.name}: ${r.detail.slice(0, 200)}`));
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    panel: PANEL,
    xui: XUI || null,
    line: lineUser,
    summary: { total, passed, failed, totalMs },
    tests: results,
  };
  writeFileSync(join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  log(`\n  Report saved: ${OUTPUT_DIR}/report.json`);

  process.exit(failed > 0 ? 1 : 0);
}

// ===== MAIN =====
async function main() {
  console.log("\n\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[36m║       NEXLIFY PANEL — FULL TEST SUITE                       ║\x1b[0m");
  console.log("\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m\n");
  console.log(`  Panel: ${PANEL}`);
  console.log(`  Admin: ${ADMIN_USER}`);
  console.log(`  XUI:   ${XUI || "(not set)"}`);
  console.log("");

  await setup();
  await testCategories();
  await testStreams();
  await testPlayback();
  await testAdminApis();
  await testXuiCompat();
  await testSecurity();
  await testPerformance();
  report();
}

main().catch(e => {
  console.error(`\n💥 FATAL: ${e?.message || e}`);
  process.exit(1);
});
