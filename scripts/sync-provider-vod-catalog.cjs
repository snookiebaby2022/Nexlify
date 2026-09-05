#!/usr/bin/env node
/**
 * Inline OpTV / xtream_vod MOVIE sync for panel 45 (no TS loader required).
 * - Pulls get_vod_streams
 * - Sets createdAt from provider `added` (XCIPTV Latest Movies)
 * - Links new/updated titles into the VOD bouquet
 * - Busts Xtream catalog disk cache
 */
const path = require("path");
const fs = require("fs");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

function extractCreds(baseUrl, apiKey, remoteUsername, remotePassword) {
  let origin;
  let username = remoteUsername?.trim() || "";
  let password = remotePassword?.trim() || "";
  try {
    const url = new URL(String(baseUrl || "").trim());
    origin = url.origin;
    username =
      username ||
      url.searchParams.get("username") ||
      url.searchParams.get("user") ||
      url.searchParams.get("login") ||
      "";
    password =
      password ||
      url.searchParams.get("password") ||
      url.searchParams.get("pass") ||
      url.searchParams.get("pwd") ||
      "";
  } catch {
    /* ignore */
  }
  if ((!username || !password) && apiKey && String(apiKey).includes(":")) {
    const idx = String(apiKey).indexOf(":");
    username = username || String(apiKey).slice(0, idx);
    password = password || String(apiKey).slice(idx + 1);
  }
  return { origin, username, password };
}

function addedUnix(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return 0;
    return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  }
  const s = String(v).trim();
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(s);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

function extOf(raw, fallback) {
  const e = String(raw || "")
    .replace(/^\./, "")
    .toLowerCase();
  if (!e || e === "hls") return fallback;
  return e;
}

async function ensureVodBouquet(p) {
  let b = await p.bouquet.findFirst({
    where: { OR: [{ name: "VOD" }, { name: { equals: "VOD", mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!b) {
    b = await p.bouquet.create({
      data: { name: "VOD", isActive: true, sortOrder: 20 },
      select: { id: true },
    });
  }
  return b.id;
}

function purgeCatalogCache() {
  const dir = process.env.NEXLIFY_CATALOG_CACHE_DIR || "/var/lib/nexlify/catalog-cache";
  let n = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.includes("xtream-vod") && !name.includes("xtream-series") && !name.startsWith("xtream-")) {
        continue;
      }
      if (!name.endsWith(".json.gz") && !name.endsWith(".lock")) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
        n++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return n;
}

async function main() {
  const p = new PrismaClient();
  const providerName = process.env.IPTV_VOD_PROVIDER || "OpTV";
  const provider = await p.streamProvider.findFirst({
    where: { name: providerName, isActive: true },
  });
  if (!provider) throw new Error(`provider ${providerName} not found`);

  const creds = extractCreds(
    provider.baseUrl,
    provider.apiKey,
    provider.remoteUsername,
    provider.remotePassword
  );
  if (!creds.origin || !creds.username || !creds.password) {
    throw new Error("OpTV missing Xtream credentials (baseUrl query or apiKey user:pass)");
  }

  const catalogUrl = `${creds.origin}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=get_vod_streams`;
  console.log("fetching", creds.origin, "get_vod_streams…");
  const res = await fetch(catalogUrl, {
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "Nexlify-Provider-Sync/1.0" },
  });
  if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("provider catalog not an array");
  console.log("provider_movies", data.length);

  const vodBouquetId = await ensureVodBouquet(p);
  const server = await p.streamServer.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  // Index existing movies by exact URL and by remote path id.
  const existing = await p.$queryRaw`
    SELECT id, name, "streamUrl", "streamIcon", "createdAt",
      (regexp_match("streamUrl", '/movie/[^/]+/[^/]+/([0-9]+)'))[1] AS "remoteId"
    FROM "Stream"
    WHERE type = 'MOVIE'
  `;
  const byUrl = new Map();
  const byRemote = new Map();
  for (const row of existing) {
    byUrl.set(row.streamUrl, row);
    if (row.remoteId && !byRemote.has(row.remoteId)) byRemote.set(row.remoteId, row);
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const now = Date.now();

  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name || row.title || "").trim();
    const streamId = String(row.stream_id || row.streamId || "").trim();
    if (!name || !streamId) continue;
    const ext = extOf(row.container_extension, "mp4");
    const streamUrl = `${creds.origin}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`;
    const add = addedUnix(row.added ?? row.added_at ?? row.last_modified);
    // New-to-panel titles use NOW so XCIPTV Latest Movies shows them immediately.
    // Provider `added` only bumps already-linked rows when it is recent (≤14d).
    const createdAt = new Date();
    const providerAddedMs = add > 0 ? add * 1000 : 0;
    const providerAddedRecent =
      providerAddedMs > 0 &&
      providerAddedMs >= now - 14 * 86400000 &&
      providerAddedMs <= now + 730 * 86400000;

    const hit = byUrl.get(streamUrl) || byRemote.get(streamId);
    if (hit) {
      const createdUnix = Math.floor(new Date(hit.createdAt).getTime() / 1000);
      const bump = providerAddedRecent && add > createdUnix;
      const rename = hit.name !== name || (row.stream_icon && !hit.streamIcon);
      const retarget = hit.streamUrl !== streamUrl;
      if (bump || rename || retarget) {
        await p.stream.update({
          where: { id: hit.id },
          data: {
            ...(rename
              ? {
                  name,
                  ...(row.stream_icon && /^https?:\/\//i.test(String(row.stream_icon))
                    ? { streamIcon: String(row.stream_icon) }
                    : {}),
                }
              : {}),
            ...(retarget ? { streamUrl } : {}),
            ...(bump ? { createdAt: new Date(providerAddedMs) } : {}),
            providerId: provider.id,
          },
        });
        await p.bouquetStream.upsert({
          where: { bouquetId_streamId: { bouquetId: vodBouquetId, streamId: hit.id } },
          create: { bouquetId: vodBouquetId, streamId: hit.id, sortOrder: 0 },
          update: {},
        });
        updated++;
      } else skipped++;
      continue;
    }

    const created = await p.stream.create({
      data: {
        name,
        streamUrl,
        streamIcon:
          row.stream_icon && /^https?:\/\//i.test(String(row.stream_icon))
            ? String(row.stream_icon)
            : null,
        type: "MOVIE",
        serverId: server?.id ?? null,
        providerId: provider.id,
        hostedExternally: true,
        isOnDemand: false,
        containerExtension: ext,
        createdAt,
      },
    });
    await p.bouquetStream.upsert({
      where: { bouquetId_streamId: { bouquetId: vodBouquetId, streamId: created.id } },
      create: { bouquetId: vodBouquetId, streamId: created.id, sortOrder: 0 },
      update: {},
    });
    imported++;
    if ((imported + updated) % 200 === 0) {
      console.log("progress", { imported, updated, skipped });
    }
  }

  // Ensure VOD bouquet is on all active lines
  const lines = await p.line.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  let linesLinked = 0;
  for (let i = 0; i < lines.length; i += 200) {
    const chunk = lines.slice(i, i + 200);
    const r = await p.lineBouquet.createMany({
      data: chunk.map((line) => ({ lineId: line.id, bouquetId: vodBouquetId })),
      skipDuplicates: true,
    });
    linesLinked += r.count;
  }

  const purged = purgeCatalogCache();
  const recent = await p.stream.count({
    where: { type: "MOVIE", isActive: true, createdAt: { gte: new Date(Date.now() - 3 * 86400000) } },
  });

  console.log(
    JSON.stringify(
      {
        provider: provider.name,
        imported,
        updated,
        skipped,
        linesLinked,
        catalogPurged: purged,
        moviesCreatedLast3d: recent,
      },
      null,
      2
    )
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
