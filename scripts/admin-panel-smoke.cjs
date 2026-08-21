#!/usr/bin/env node
/**
 * Admin/reseller panel smoke (run on VPS with ADMIN_USER / ADMIN_PASS env).
 * Does not print credentials.
 */
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:80";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "";

const results = [];
const fail = (name, detail) => results.push({ name, ok: false, detail });
const pass = (name, detail = "") => results.push({ name, ok: true, detail });

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: "manual" });
  const ct = res.headers.get("content-type") || "";
  let body = null;
  if (ct.includes("json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    body = await res.text();
  }
  return { res, body };
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  if (!PASS) {
    console.error("Set ADMIN_PASS");
    process.exit(1);
  }

  // Login
  const login = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (login.res.status !== 200 || !login.body?.ok) {
    fail("admin login", `HTTP ${login.res.status}`);
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }
  pass("admin login");
  const cookie = cookieFrom(login.res);
  const auth = { headers: { cookie } };

  const pages = [
    ["/admin/dashboard", "admin dashboard"],
    ["/admin/connections", "admin live connections"],
    ["/admin/streams", "admin streams"],
    ["/admin/lines", "admin manage lines"],
    ["/admin/content/movies", "admin movies"],
    ["/admin/content/series", "admin series"],
    ["/admin/watch-folders", "admin watch folders"],
    ["/admin/management/categories", "admin categories"],
    ["/admin/m3u-sync", "admin m3u sync"],
    ["/reseller/live_connections", "reseller live connections"],
    ["/reseller/lines", "reseller lines"],
  ];

  for (const [path, name] of pages) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    const ok = r.status >= 200 && r.status < 400;
    (ok ? pass : fail)(name, `HTTP ${r.status}`);
  }

  const apis = [
    ["/api/admin/connections", "api admin connections"],
    ["/api/admin/lines?limit=5", "api admin lines"],
    ["/api/admin/streams?limit=5", "api admin streams"],
    ["/api/admin/watch-folders", "api watch folders"],
    ["/api/admin/categories?limit=5", "api categories"],
    ["/api/admin/m3u-sync", "api m3u sync"],
  ];

  for (const [path, name] of apis) {
    const { res, body } = await fetchJson(`${BASE}${path}`, auth);
    const ok =
      res.status === 200 &&
      body &&
      (Array.isArray(body) ||
        body.items ||
        body.lines ||
        body.streams ||
        body.categories ||
        body.jobs ||
        body.folders != null ||
        body.connections != null);
    (ok ? pass : fail)(name, `HTTP ${res.status} ${typeof body === "object" ? Object.keys(body).slice(0, 4).join(",") : String(body).slice(0, 40)}`);
  }

  // Create test line (with first active bouquet for playback)
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const defaultBouquet = await prisma.bouquet.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  const uname = `_smoke_${Date.now().toString(36).slice(-6)}`;
  const create = await fetchJson(`${BASE}/api/admin/lines`, {
    method: "POST",
    ...auth,
    headers: { ...auth.headers, "content-type": "application/json" },
    body: JSON.stringify({
      username: uname,
      password: "SmokeTest99!",
      maxConnections: 1,
      days: 30,
      bouquetIds: defaultBouquet ? [defaultBouquet.id] : [],
    }),
  });
  if (create.res.status === 200 || create.res.status === 201) {
    pass("create test subscription", uname);
  } else {
    fail("create test subscription", `HTTP ${create.res.status} ${JSON.stringify(create.body).slice(0, 120)}`);
  }

  // Playback probe with created smoke line
  try {
    const line = await prisma.line.findFirst({ where: { username: uname } });
    let stream = null;
    if (line) {
      const lb = await prisma.lineBouquet.findFirst({
        where: { lineId: line.id },
        include: { bouquet: { include: { streams: { take: 1, include: { stream: true } } } } },
      });
      stream = lb?.bouquet?.streams?.[0]?.stream ?? null;
    }
    if (!stream) {
      stream = await prisma.stream.findFirst({ where: { type: "LIVE", isActive: true }, select: { id: true, name: true } });
    }
    if (stream && line) {
      const edge = `${process.env.SMOKE_EDGE || "http://127.0.0.1:80"}`;
      for (const ext of ["m3u8", "ts"]) {
        const url = `${edge}/live/${line.username}/${line.password}/${stream.id}.${ext}`;
        try {
          if (ext === "ts") {
            const r = await fetch(url, {
              method: "HEAD",
              headers: { "User-Agent": "VLC/3.0.20", "X-Forwarded-For": "203.0.113.55" },
              signal: AbortSignal.timeout(12_000),
            });
            (r.ok ? pass : fail)(`playback edge ${ext}`, `HTTP ${r.status}`);
          } else {
            const r = await fetch(url, {
              headers: { "User-Agent": "ExoPlayer/2.11", "X-Forwarded-For": "203.0.113.55" },
              signal: AbortSignal.timeout(12_000),
            });
            const text = await r.text();
            (r.ok && text.length > 100 ? pass : fail)(`playback edge ${ext}`, `HTTP ${r.status} bytes=${text.length}`);
          }
        } catch (e) {
          fail(`playback edge ${ext}`, e instanceof Error ? e.message : String(e));
        }
      }

      const { res: connRes, body: connBody } = await fetchJson(`${BASE}/api/admin/connections`, auth);
      const connCount = Array.isArray(connBody?.connections)
        ? connBody.connections.length
        : Array.isArray(connBody)
          ? connBody.length
          : 0;
      (connRes.status === 200 ? pass : fail)("live connections api after playback", `HTTP ${connRes.status} rows=${connCount}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ pass: results.filter((r) => r.ok).length, fail: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
