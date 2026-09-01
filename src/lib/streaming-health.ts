import { prisma } from "@/lib/prisma";
import { getAntiFreezeSettings } from "@/lib/anti-freeze";
import { bouquetContentCounts } from "@/lib/bouquet-counts";
import { isMultiWorkerPanel, isRedisConfigured } from "@/lib/cache";
import { redisModeFromEnv, redisPing } from "@/lib/redis";
import { detectHostHardware, buildOptimizationProfile } from "@/lib/server-optimization";
import { getServerLoadScores } from "@/lib/server-load";
import { bufferingRisk, bufferingRiskLabel } from "@/lib/server-load-metrics";
import { batchGetLiveQualitySamples } from "@/lib/connection-quality-live";
import { listLiveConnections } from "@/lib/connections";
import { getSourceCircuit } from "@/lib/source-circuit-breaker";

export async function getStreamingHealthSnapshot() {
  const [servers, streamCounts, bouquets, lines, antiFreeze, redisOk, liveProbeStats, loadScores, liveConnections] = await Promise.all([
    prisma.streamServer.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        isActive: true,
        agentLastSeen: true,
        agentToken: true,
        healthStatus: true,
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
    getServerLoadScores(),
    listLiveConnections(undefined, 500),
  ]);

  const hardware = detectHostHardware();
  const recommended = buildOptimizationProfile(hardware);

  const now = Date.now();
  const liveSamples = await batchGetLiveQualitySamples(
    liveConnections.map((c) => ({ lineId: c.lineId, streamId: c.streamId ?? "", ip: c.ip }))
  );
  const stallSessions = liveSamples.filter((sample) => (sample?.stallCount ?? 0) > 0).length;
  const serverLoadById = new Map(loadScores.map((row) => [row.server.id, row]));

  const serverRows = servers.map((s) => {
    const hb = s.agentLastSeen ? new Date(s.agentLastSeen).getTime() : 0;
    const online = s.isActive && (s.healthStatus === "online" || s.healthStatus === "healthy" || (hb > 0 && now - hb < 300_000));
    const load = serverLoadById.get(s.id);
    const loadPct = Math.round((load?.score ?? 0) * 100);
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      isActive: s.isActive,
      online,
      hasAgent: Boolean(s.agentToken),
      agentLastSeen: s.agentLastSeen,
      maxClients: s.maxClients,
      loadPct,
      usedMbps: load?.bandwidthMbps ?? 0,
      capMbps: load?.capMbps ?? 0,
      headroomPct: load?.headroomPct ?? 100,
      bufferingRisk: bufferingRisk({
        online,
        saturated: load?.saturated ?? false,
        headroomPct: load?.headroomPct ?? 100,
        loadPct,
      }),
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

  const redisConfigured = isRedisConfigured();
  const clusterNeedsRedis = isMultiWorkerPanel();
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
      ok: clusterNeedsRedis ? redisConfigured && redisOk : fastZapReady,
      href: "/admin/settings/cache",
      hint: clusterNeedsRedis
        ? redisConfigured
          ? redisOk
            ? `Redis connected (${redisModeFromEnv()}) — required for ${process.env.PANEL_INSTANCES ?? 2} workers`
            : "Redis unreachable — multi-worker panel degraded"
          : "REDIS_URL required when PANEL_INSTANCES > 1"
        : !antiFreeze.fastZapEnabled
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

  const riskRows = serverRows.filter((s) => s.isActive && s.bufferingRisk !== "healthy");
  const degradedStreams = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, OR: [{ lastProbeOk: false }, { lastProbeOk: null }] },
    select: { id: true, name: true, streamUrl: true, backupUrl: true, lastProbeError: true },
    orderBy: { lastProbeAt: "asc" },
    take: 30,
  });
  const sourceDiagnostics = await Promise.all(degradedStreams.map(async (stream) => {
    const urls = [stream.streamUrl, stream.backupUrl].filter((url): url is string => Boolean(url?.trim()));
    const sources = await Promise.all(urls.map(async (url) => {
      const circuit = await getSourceCircuit(stream.id, url);
      return { url, ...circuit };
    }));
    return { id: stream.id, name: stream.name, lastProbeError: stream.lastProbeError, sources };
  }));

  return {
    servers: serverRows,
    buffering: {
      risk: riskRows.some((s) => s.bufferingRisk === "critical") ? "critical" : riskRows.length ? "watch" : "healthy",
      label: riskRows.some((s) => s.bufferingRisk === "critical") ? "High buffering risk" : riskRows.length ? "Watch closely" : "Healthy",
      liveConnections: liveConnections.length,
      stallSessions,
      atRiskServers: riskRows.map((s) => ({ id: s.id, name: s.name, risk: s.bufferingRisk, label: bufferingRiskLabel(s.bufferingRisk), headroomPct: s.headroomPct })),
      sourceDiagnostics,
    },
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
