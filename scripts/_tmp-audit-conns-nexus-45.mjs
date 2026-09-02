#!/usr/bin/env node
/** Audit live connections QoE vs uptime + empty playlist lines on server 45. */
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const p = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const now = Date.now();

function uptimeSec(startedAt, lastSeenAt) {
  const start = new Date(startedAt).getTime();
  const last = new Date(lastSeenAt).getTime();
  const end = now - last > 8000 ? last : now;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function fmtSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

function qKey(lineId, streamId, ip) {
  const ips = new Set();
  const raw = ip?.trim() ?? "";
  if (raw) ips.add(raw);
  ips.add("");
  ips.add("*");
  return [...ips].map((k) => `conn:q:${lineId}:${streamId}:${k || "*"}`);
}

async function getQoE(lineId, streamId, ip) {
  const keys = qKey(lineId, streamId, ip);
  for (const k of keys) {
    const raw = await redis.get(k);
    if (!raw) continue;
    try {
      const w = JSON.parse(raw);
      if (w?.totalBytes > 0) return w;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function qualityFromLastSeen(lastSeenAt) {
  const staleSec = Math.max(0, (now - new Date(lastSeenAt).getTime()) / 1000);
  if (staleSec <= 15) return 98;
  if (staleSec <= 45) return 95;
  if (staleSec <= 90) return 90;
  if (staleSec <= 180) return 80;
  return 50;
}

try {
  const rows = await p.liveConnection.findMany({
    where: { lastSeenAt: { gte: new Date(now - 3 * 60 * 1000) } },
    orderBy: { startedAt: "asc" },
    include: {
      line: { select: { username: true } },
      stream: { select: { name: true, vodMode: true, isOnDemand: true } },
    },
  });

  console.log("=== LIVE CONNECTIONS", rows.length, "===");

  const audit = [];
  for (const c of rows) {
    const w = await getQoE(c.lineId, c.streamId, c.ip);
    const up = uptimeSec(c.startedAt, c.lastSeenAt);
    const stallCount = w?.stallCount ?? 0;
    const mbps = w?.peakBytesPerSec ? (Math.max(w.peakBytesPerSec, 0) * 8) / 1_000_000 : 0;
    const mode =
      c.stream?.vodMode === "LIVE"
        ? "LIVE"
        : c.stream?.isOnDemand || c.stream?.vodMode === "ON_DEMAND"
          ? "ON-DEMAND"
          : c.stream?.vodMode ?? "?";
    audit.push({
      stream: c.stream?.name ?? "?",
      line: c.line.username,
      ip: c.ip,
      ua: (c.userAgent ?? "").slice(0, 55),
      uptime: fmtSec(up),
      uptimeSec: up,
      qualityPct: qualityFromLastSeen(c.lastSeenAt),
      stalls: stallCount,
      mbps: mbps.toFixed(1),
      totalMb: w?.totalBytes ? (w.totalBytes / 1_048_576).toFixed(1) : "0",
      mode,
      lastSeenSec: Math.round((now - new Date(c.lastSeenAt).getTime()) / 1000),
      firstByteLagSec: w?.firstByteAt ? Math.round((w.firstByteAt - new Date(c.startedAt).getTime()) / 1000) : null,
    });
  }

  audit.sort((a, b) => b.stalls - a.stalls || b.uptimeSec - a.uptimeSec);

  console.log("\n--- High stalls (3+) ---");
  for (const r of audit.filter((x) => x.stalls >= 3)) console.log(JSON.stringify(r));

  console.log("\n--- All (top 35 by stalls) ---");
  for (const r of audit.slice(0, 35)) console.log(JSON.stringify(r));

  const mismatch = audit.filter((x) => x.uptimeSec >= 600 && x.stalls >= 5);
  console.log("\n=== MISMATCH long uptime 10m+ AND 5+ stalls:", mismatch.length, "===");
  for (const r of mismatch) console.log(JSON.stringify(r));

  console.log("\n=== NEXUS / RECENT LINES (playlist check) ===");
  const lineRows = await p.$queryRaw`
    SELECT DISTINCT ON (l.id)
      l.id, l.username, l.status, l."expiresAt", l."allowedUserAgents",
      lc."userAgent", lc."lastSeenAt"
    FROM "Line" l
    LEFT JOIN "LiveConnection" lc ON lc."lineId" = l.id
    WHERE l.status = 'ACTIVE'
      AND (
        lc."userAgent" ILIKE '%nexus%'
        OR lc."lastSeenAt" > now() - interval '6 hours'
      )
    ORDER BY l.id, lc."lastSeenAt" DESC NULLS LAST
    LIMIT 25`;

  for (const row of lineRows) {
    const bouquets = await p.lineBouquet.findMany({
      where: { lineId: row.id },
      include: { bouquet: { select: { name: true, isActive: true, _count: { select: { streams: true } } } } },
    });
    const bIds = bouquets.filter((b) => b.bouquet.isActive).map((b) => b.bouquetId);
    let liveStreams = 0;
    let liveCats = 0;
    if (bIds.length) {
      liveStreams = await p.$queryRaw`
        SELECT count(DISTINCT s.id)::int AS c
        FROM "Stream" s
        JOIN "BouquetStream" bs ON bs."streamId" = s.id
        WHERE bs."bouquetId" = ANY(${bIds}::text[])
          AND s.type = 'LIVE' AND s."isActive" = true`;
      liveCats = await p.$queryRaw`
        SELECT count(DISTINCT s."categoryId")::int AS c
        FROM "Stream" s
        JOIN "BouquetStream" bs ON bs."streamId" = s.id
        WHERE bs."bouquetId" = ANY(${bIds}::text[])
          AND s.type = 'LIVE' AND s."isActive" = true AND s."categoryId" IS NOT NULL`;
    }
    console.log(
      JSON.stringify({
        username: row.username,
        ua: String(row.userAgent ?? "").slice(0, 70),
        lastSeen: row.lastSeenAt,
        bouquets: bouquets.map((b) => ({
          name: b.bouquet.name,
          active: b.bouquet.isActive,
          streams: b.bouquet._count.streams,
        })),
        activeBouquetCount: bIds.length,
        liveStreams: liveStreams[0]?.c ?? 0,
        liveCategories: liveCats[0]?.c ?? 0,
        allowedUA: row.allowedUserAgents?.slice?.(0, 40) ?? row.allowedUserAgents,
        expiresAt: row.expiresAt,
      })
    );
  }

  console.log("\n=== ACTIVE LINES WITH ZERO BOUQUETS ===");
  const zero = await p.line.findMany({
    where: { status: "ACTIVE", bouquets: { none: {} } },
    select: { username: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(JSON.stringify(zero, null, 2));

  console.log("\n=== RECENT NEXUS UA HITS ===");
  const nexus = await p.$queryRaw`
    SELECT l.username, lc."userAgent", lc."lastSeenAt"::text AS seen,
           (SELECT count(*)::int FROM "LineBouquet" lb WHERE lb."lineId" = l.id) AS bouquets
    FROM "LiveConnection" lc
    JOIN "Line" l ON l.id = lc."lineId"
    WHERE lc."userAgent" ILIKE '%nexus%'
    ORDER BY lc."lastSeenAt" DESC
    LIMIT 10`;
  console.log(JSON.stringify(nexus, null, 2));
} finally {
  await p.$disconnect();
  redis.disconnect();
}
