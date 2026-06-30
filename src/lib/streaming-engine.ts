import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { getStreamLiveStatsMap, type StreamStatsInput } from "@/lib/stream-live-stats";
import { getStreamPlaybackMode } from "@/lib/stream-playback-mode";
import { isTranscodingPackEnabled } from "@/lib/gpu-transcode";
import { isLbProEnabled } from "@/lib/intelligent-lb";

export async function getStreamingEngineSnapshot() {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const now = Date.now();

  const [servers, streams, processes, connections, magCount, enigmaCount, streamSettings, transcodeOn, lbProOn] =
    await Promise.all([
      prisma.streamServer.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: { select: { streams: true, processes: true } },
        },
      }),
      prisma.stream.findMany({
        where: { isActive: true, type: "LIVE" },
        select: {
          id: true,
          name: true,
          isActive: true,
          lastProbeOk: true,
          vodMode: true,
          isOnDemand: true,
          isCreatedChannel: true,
          agentStartCmd: true,
          autoRestart: true,
          streamUrl: true,
          hostedExternally: true,
          serverId: true,
        },
        take: 500,
      }),
      prisma.streamProcess.findMany({
        where: { lastSeenAt: { gte: staleBefore } },
        include: { server: { select: { id: true, name: true } }, stream: { select: { id: true, name: true } } },
      }),
      prisma.liveConnection.count({ where: { lastSeenAt: { gte: staleBefore } } }),
      prisma.magDevice.count({ where: { isActive: true } }),
      prisma.enigmaDevice.count({ where: { isActive: true } }),
      getSettingGroup("streams"),
      isTranscodingPackEnabled(),
      isLbProEnabled(),
    ]);

  const statsMap = await getStreamLiveStatsMap(streams as StreamStatsInput[]);

  let direct = 0;
  let onDemand = 0;
  let transcode = 0;
  let online = 0;
  for (const s of streams) {
    const mode = getStreamPlaybackMode(s);
    if (mode === "direct") direct += 1;
    else if (mode === "on_demand" || mode === "created" || mode === "catchup") onDemand += 1;
    else transcode += 1;
    const st = statsMap.get(s.id);
    if (st?.status === "online" || st?.status === "direct" || st?.status === "ready") online += 1;
  }

  const serverRows = servers.map((s) => {
    const hb = s.agentLastSeen ? new Date(s.agentLastSeen).getTime() : 0;
    const agentOnline = s.isActive && hb > 0 && now - hb < 120_000;
    const runningProcs = processes.filter((p) => p.serverId === s.id && p.status === "running").length;
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      isActive: s.isActive,
      agentOnline,
      agentVersion: s.agentVersion,
      healthStatus: s.healthStatus,
      streamCount: s._count.streams,
      processCount: runningProcs,
      maxClients: s.maxClients,
      region: s.region,
      bandwidthMbps: s.bandwidthMbps,
    };
  });

  return {
    summary: {
      servers: servers.length,
      serversOnline: serverRows.filter((s) => s.agentOnline).length,
      liveStreams: streams.length,
      streamsPlayable: online,
      directSources: direct,
      onDemandChannels: onDemand,
      transcodeChannels: transcode,
      runningProcesses: processes.filter((p) => p.status === "running").length,
      activeViewers: connections,
      magDevices: magCount,
      enigmaDevices: enigmaCount,
    },
    features: {
      antiFreeze: streamSettings.antiFreezeEnabled !== false,
      fastZap: streamSettings.fastZapEnabled !== false,
      geoLb: streamSettings.geoLoadBalancing !== false,
      loadBalancing: String(streamSettings.loadBalancing ?? "server_slots"),
      transcodePack: transcodeOn,
      lbPro: lbProOn,
      allowRestream: streamSettings.allowRestream === true,
    },
    servers: serverRows,
    processes: processes.slice(0, 50).map((p) => ({
      id: p.id,
      serverName: p.server.name,
      streamName: p.stream?.name ?? "—",
      status: p.status,
      cpuPercent: p.cpuPercent,
      bitrateKbps: p.bitrateKbps,
      errorMessage: p.errorMessage,
    })),
  };
}
