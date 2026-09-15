#!/usr/bin/env node
/** Full Xtream smoke: auth, categories, VOD/series counts, optional live bytes on edge. */
const http = require("http");
const https = require("https");
const zlib = require("zlib");

const USER = process.env.XTREAM_USER || "test888";
const PASS = process.env.XTREAM_PASS || "test999";
const BASES = (process.env.XTREAM_BASES ||
  "http://45.88.138.18,http://209.237.141.15:8080,http://darkcdn.site")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function fetchJson(base, path, timeoutMs = 120_000) {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "XCIPTV",
          "Accept-Encoding": "gzip",
        },
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let buf = Buffer.concat(chunks);
          if (buf[0] === 0x1f && buf[1] === 0x8b) {
            try {
              buf = zlib.gunzipSync(buf);
            } catch {
              /* raw */
            }
          }
          const text = buf.toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = { _parseError: true, raw: text.slice(0, 400) };
          }
          resolve({ status: res.statusCode, json, bytes: buf.length });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${url.href}`));
    });
  });
}

function q(action, extra = {}) {
  const p = new URLSearchParams({
    username: USER,
    password: PASS,
    action,
    ...extra,
  });
  return `player_api.php?${p}`;
}

function uniqStreamIds(items) {
  const ids = (items || []).map((x) => String(x.stream_id ?? x.series_id ?? ""));
  return { count: ids.length, unique: new Set(ids).size };
}

function sampleNames(items, n = 5) {
  return (items || []).slice(0, n).map((x) => x.name || x.title || "?");
}

async function probeBase(base) {
  const out = { base, ok: false, steps: {} };
  try {
    const auth = await fetchJson(base, q(""));
    out.steps.auth = {
      status: auth.status,
      user_info: auth.json?.user_info
        ? {
            auth: auth.json.user_info.auth,
            status: auth.json.user_info.status,
            exp_date: auth.json.user_info.exp_date,
          }
        : auth.json,
    };
    if (auth.json?.user_info?.auth !== 1) {
      out.error = "auth_failed";
      return out;
    }

    const si = auth.json?.server_info || {};
    out.steps.server_info = {
      url: si.url,
      port: si.port,
      https_port: si.https_port,
      server_protocol: si.server_protocol,
    };

    const liveCat = await fetchJson(base, q("get_live_categories"));
    out.steps.live_categories = {
      status: liveCat.status,
      count: Array.isArray(liveCat.json) ? liveCat.json.length : 0,
    };

    const vodCat = await fetchJson(base, q("get_vod_categories"));
    const vodCats = Array.isArray(vodCat.json) ? vodCat.json : [];
    out.steps.vod_categories = {
      status: vodCat.status,
      count: vodCats.length,
      sample: vodCats.slice(0, 8).map((c) => ({
        id: c.category_id,
        name: c.category_name,
      })),
    };

    const seriesCat = await fetchJson(base, q("get_series_categories"));
    out.steps.series_categories = {
      status: seriesCat.status,
      count: Array.isArray(seriesCat.json) ? seriesCat.json.length : 0,
    };

    const newCat =
      vodCats.find((c) => /^new$/i.test(String(c.category_name))) ||
      vodCats.find((c) => /recently added/i.test(String(c.category_name)));
    if (newCat) {
      const vod = await fetchJson(
        base,
        q("get_vod_streams", { category_id: String(newCat.category_id) })
      );
      const movies = Array.isArray(vod.json) ? vod.json : [];
      const ids = uniqStreamIds(movies);
      out.steps.vod_new = {
        category: newCat.category_name,
        category_id: newCat.category_id,
        status: vod.status,
        bytes: vod.bytes,
        ...ids,
        dupes: ids.count - ids.unique,
        topTitles: sampleNames(movies),
      };
    } else {
      out.steps.vod_new = { skipped: "no NEW/Recently Added category" };
    }

    if (vodCats[0]) {
      const cid = String(vodCats[0].category_id);
      const vodSample = await fetchJson(base, q("get_vod_streams", { category_id: cid }), 180_000);
      const movies = Array.isArray(vodSample.json) ? vodSample.json : [];
      const ids = uniqStreamIds(movies);
      out.steps.vod_first_category = {
        category_id: cid,
        name: vodCats[0].category_name,
        status: vodSample.status,
        bytes: vodSample.bytes,
        ...ids,
      };
    }

    const live = await fetchJson(base, q("get_live_streams"));
    const streams = Array.isArray(live.json) ? live.json : [];
    out.steps.live_streams = {
      status: live.status,
      count: streams.length,
      sample: sampleNames(streams, 3),
    };

    const edgeHost = si.url || "209.237.141.15";
    const edgePort = si.port || "8080";
    const proto = si.server_protocol === "https" ? "https" : "http";
    const first = streams.find((s) => s.stream_id);
    if (first) {
      const livePath = `/live/${encodeURIComponent(USER)}/${encodeURIComponent(PASS)}/${first.stream_id}.ts`;
      const liveUrl = `${proto}://${edgeHost}:${edgePort}${livePath}`;
      const lib = proto === "https" ? https : http;
      const liveProbe = await new Promise((resolve) => {
        let bytes = 0;
        const req = lib.get(
          liveUrl,
          {
            headers: { "User-Agent": "VLC/3.0.20", Accept: "*/*" },
            timeout: 12_000,
            rejectUnauthorized: false,
          },
          (res) => {
            const status = res.statusCode;
            res.on("data", (c) => {
              bytes += c.length;
              if (bytes > 200_000) req.destroy();
            });
            res.on("end", () => resolve({ status, bytes, url: liveUrl }));
            res.on("close", () => resolve({ status, bytes, url: liveUrl }));
          }
        );
        req.on("error", (e) => resolve({ status: 0, bytes: 0, error: e.message, url: liveUrl }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ status: 0, bytes, error: "timeout", url: liveUrl });
        });
      });
      out.steps.live_bytes = liveProbe;
    }

    out.ok =
      out.steps.auth?.user_info?.auth === 1 &&
      out.steps.live_categories?.count > 0 &&
      out.steps.vod_categories?.count > 0;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

(async () => {
  const results = [];
  for (const base of BASES) {
    console.error(`=== probe ${base} ===`);
    results.push(await probeBase(base));
  }
  console.log(JSON.stringify({ user: USER, results }, null, 2));
  const allOk = results.every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
})();
