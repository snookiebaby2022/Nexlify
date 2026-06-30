import { prisma } from "@/lib/prisma";
import { getAntiFreezeSettings } from "@/lib/anti-freeze";
import { bouquetContentCounts } from "@/lib/bouquet-counts";
import { redisModeFromEnv, redisPing } from "@/lib/redis";
import { detectHostHardware, buildOptimizationProfile } from "@/lib/server-optimization";

export async function getStreamingHealthSnapshot() {
  const [servers, streamCounts, bouquets, lines, antiFreeze, redisOk, liveProbeStats] = await Promise.all([
    prisma.streamServer.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        isActive: true,
        agentLastSeen: true,
        agentToken: true,
        maxClients: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.stream.groupBy({
      by: ["type"],
      where: { isActive: true },
      _count: { id: true },
    }),
    prisma.bouquet.findMany({
      where: { isActive: true },
      include: {
        streams: { include: { stream: { select: { type: true, isRadio: true } } } },
        _count: { select: { lines: true } },
      },
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.line.count({ where: { status: "ACTIVE" } }),
    getAntiFreezeSettings(),
    redisPing(),
    prisma.stream.groupBy({
      by: ["lastProbeOk"],
      where: { isActive: true, type: "LIVE" },
      _count: { id: true },
    }),
  ]);

  const hardware = detectHostHardware();
  const recommended = buildOptimizationProfile(hardware);

  const now = Date.now();
  const serverRows = servers.map((s) => {
    const hb = s.agentLastSeen ? new Date(s.agentLastSeen).getTime() : 0;
    const online = s.isActive && hb > 0 && now - hb < 120_000;
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      isActive: s.isActive,
      online,
      hasAgent: Boolean(s.agentToken),
      agentLastSeen: s.agentLastSeen,
      maxClients: s.maxClients,
    };
  });

  const byType = Object.fromEntries(streamCounts.map((r) => [r.type, r._count.id]));
  const radioCount = await prisma.stream.count({ where: { isActive: true, isRadio: true } });

  const bouquetRows = bouquets.map((b) => ({
    id: b.id,
    name: b.name,
    lineCount: b._count.lines,
    counts: bouquetContentCounts(b.streams),
  }));

  const emptyBouquets = bouquetRows.filter((b) => b.counts.total === 0);
  const onlineServers = serverRows.filter((s) => s.online).length;

  let probeOk = 0;
  let probeFail = 0;
  let probeUnknown = 0;
  for (const row of liveProbeStats) {
    const n = row._count.id;
    if (row.lastProbeOk === true) probeOk += n;
    else if (row.lastProbeOk === false) probeFail += n;
    else probeUnknown += n;
  }
  const liveTotal = probeOk + probeFail + probeUnknown;
  const streamsHealthy = liveTotal === 0 || probeFail === 0;

  const redisConfigured = Boolean(
    process.env.REDIS_URL?.trim() || process.env.REDIS_CLUSTER_NODES?.trim()
  );
  const fastZapReady = antiFreeze.fastZapEnabled && (redisOk || !redisConfigured);
  const prefetchReady =
    antiFreeze.zapPrefetchOnLiveHit && antiFreeze.zapPrefetchNeighbors > 0;

  const checklist = [
    {
      id: "server",
      label: "Streaming server online",
      ok: onlineServers > 0,
      href: "/admin/servers",
      hint: onlineServers > 0 ? `${onlineServers} server(s) online` : "Add a server and install the agent",
    },
    {
      id: "streams",
      label: "Active streams in catalog",
      ok: (byType.LIVE ?? 0) + (byType.MOVIE ?? 0) + (byType.SERIES ?? 0) > 0,
      href: "/admin/streams/add",
      hint: `${(byType.LIVE ?? 0) + (byType.MOVIE ?? 0) + (byType.SERIES ?? 0)} active stream(s)`,
    },
    {
      id: "stream-probes",
      label: "Live streams healthy",
      ok: streamsHealthy,
      href: "/admin/streaming/engine",
      hint:
        liveTotal === 0
          ? "No live streams to probe yet"
          : probeFail > 0
            ? `${probeFail} failed probe(s) — check Streaming Engine`
            : `${probeOk} live stream(s) passing probes`,
    },
    {
      id: "bouquet",
      label: "Bouquet has content",
      ok: bouquetRows.some((b) => b.counts.total > 0),
      href: "/admin/bouquets",
      hint:
        emptyBouquets.length === bouquetRows.length
          ? "Assign streams to at least one bouquet"
          : `${bouquetRows.filter((b) => b.counts.total > 0).length} bouquet(s) with content`,
    },
    {
      id: "lines",
      label: "Active subscriber lines",
      ok: lines > 0,
      href: "/admin/lines/add",
      hint: `${lines} active line(s)`,
    },
    {
      id: "antifreeze",
      label: "Anti-freeze enabled",
      ok: antiFreeze.antiFreezeEnabled,
      href: "/admin/settings/streams",
      hint: antiFreeze.antiFreezeEnabled ? "Anti-freeze ON — nginx live buffering off" : "Enable in Settings → Streams",
    },
    {
      id: "redis",
      label: "Redis URL cache (Fast Zap)",
      ok: fastZapReady,
      href: "/admin/settings/cache",
      hint: !antiFreeze.fastZapEnabled
        ? "Enable Fast Zap in Settings → Streams"
        : redisConfigured
          ? redisOk
            ? `Redis connected (${redisModeFromEnv()})`
            : "Redis unreachable — check REDIS_URL"
          : "Fast Zap active (in-memory cache — set REDIS_URL for multi-worker)",
    },
    {
      id: "prefetch",
      label: "Neighbour-channel prefetch",
      ok: prefetchReady,
      href: "/admin/settings/streams",
      hint: prefetchReady
        ? `Prefetch ×${antiFreeze.zapPrefetchNeighbors} on channel play`
        : "Enable prefetch neighbours in Settings → Streams",
    },
  ];

  const readyScore = checklist.filter((c) => c.ok).length;

  return {
    servers: serverRows,
    onlineServers,
    streamCounts: {
      live: byType.LIVE ?? 0,
      movie: byType.MOVIE ?? 0,
      series: byType.SERIES ?? 0,
      radio: radioCount,
    },
    streamProbes: { ok: probeOk, fail: probeFail, unknown: probeUnknown, total: liveTotal, healthy: streamsHealthy },
    bouquets: bouquetRows,
    emptyBouquets: emptyBouquets.map((b) => b.name),
    activeLines: lines,
    antiFreeze,
    redis: { connected: redisOk, configured: redisConfigured, mode: redisModeFromEnv() },
    optimization: {
      hardware,
      recommendedTier: recommended.tier,
      recommendedLabel: recommended.label,
      notes: recommended.notes,
    },
    checklist,
    readyScore,
    readyTotal: checklist.length,
    streamingReady: readyScore === checklist.length && onlineServers > 0,
  };
}
