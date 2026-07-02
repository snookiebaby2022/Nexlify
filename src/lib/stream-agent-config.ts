import { getSettingGroup } from "@/lib/panel-settings";
import { pathsFromBinRoot, NEXLIFY_BIN_LAYOUT } from "@/lib/bin-paths-layout";
import { buildFfmpegStartCmd, buildFfmpegStopCmd, agentPidFile } from "@/lib/ffmpeg-agent";
import { buildNginxAgentSnippet } from "@/lib/nginx-agent-snippet";

export type AgentNginxConfig = {
  bufferLive: boolean;
  bufferVod: boolean;
  bufferCountLive: number;
  bufferCountVod: number;
  bufferSizeLive: string;
  bufferSizeVod: string;
  hlsSegmentDuration: number;
  proxyBufferSize: string;
  readTimeout: number;
  connectionTimeout: number;
};

export type AgentStreamEntry = {
  id: string;
  name: string;
  streamUrl: string;
  autoRestart: boolean;
  type: string;
  startCmd: string;
  stopCmd: string;
  pidFile: string;
  agentPid: number | null;
};

export type AgentStreamConfig = {
  revision: number;
  nginx: AgentNginxConfig;
  nginxSnippet: string;
  nginxSnippetPath: string;
  ffmpegPreset: string;
  ffmpegThreads: number;
  transcodingPack?: {
    enabled: boolean;
    profileId: string;
    gpuEncoder: string;
    ladderIds: string[];
  };
  binRoot: string;
  nginxPath: string;
  ffmpegPath: string;
  streams: AgentStreamEntry[];
};

export async function buildAgentConfigForServer(
  serverId: string,
  revision: number
): Promise<AgentStreamConfig> {
  const [streamsSettings, binaries] = await Promise.all([
    getSettingGroup("streams"),
    getSettingGroup("binaries"),
  ]);

  const { prisma } = await import("@/lib/prisma");
  const { parseServerPanelSettings } = await import("@/lib/server-panel-settings");
  const serverRow = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: { panelSettings: true },
  });
  const serverPerf = parseServerPanelSettings(serverRow?.panelSettings).performance;

  const binRoot = String(binaries.binRoot ?? NEXLIFY_BIN_LAYOUT.binRoot);
  const paths = pathsFromBinRoot(binRoot);
  const ffmpegPath = String(binaries.ffmpegPath ?? paths.ffmpegPath);
  const preset = String(streamsSettings.transcodePreset ?? "veryfast");
  const globalThreads = Number(streamsSettings.ffmpegThreadCount ?? 0);
  const threads =
    serverPerf.cpuThreads > 0
      ? serverPerf.cpuThreads
      : globalThreads > 0
        ? globalThreads
        : 0;

  const { isTranscodingPackEnabled, getTranscodingPackSettings, GPU_TRANSCODE_LADDER, pickAdaptiveProfile, buildGpuFfmpegArgs, bitrateLadderForStream } =
    await import("@/lib/gpu-transcode");
  const transcodeEnabled = await isTranscodingPackEnabled();
  const transcodeSettings = transcodeEnabled ? await getTranscodingPackSettings() : null;
  let transcodeProfile: import("@/lib/gpu-transcode").GpuTranscodeProfile | null = null;
  let transcodeLadder: import("@/lib/gpu-transcode").GpuTranscodeProfile[] = [];
  if (transcodeEnabled && transcodeSettings?.enabled !== false) {
    const ladderId = String(transcodeSettings.ladderProfile ?? "1080p-nvenc");
    transcodeLadder = bitrateLadderForStream(ladderId);
    transcodeProfile = pickAdaptiveProfile(transcodeLadder, {
      preferHevc: transcodeSettings.enableHevc === true,
      maxBandwidthKbps: transcodeSettings.enable4K ? undefined : 12000,
    });
  }

  const antiFreeze = streamsSettings.antiFreezeEnabled !== false;
  const hlsBase = Number(streamsSettings.hlsSegmentDuration ?? 6);
  const nginx: AgentNginxConfig = {
    bufferLive: antiFreeze ? false : Boolean(streamsSettings.nginxBufferLive),
    bufferVod: Boolean(streamsSettings.nginxBufferVod),
    bufferCountLive: Number(streamsSettings.nginxBufferCountLive ?? 96),
    bufferCountVod: Number(streamsSettings.nginxBufferCountVod ?? 96),
    bufferSizeLive: String(streamsSettings.nginxBufferSizeLive ?? "32k"),
    bufferSizeVod: String(streamsSettings.nginxBufferSizeVod ?? "32k"),
    hlsSegmentDuration: antiFreeze ? Math.min(4, hlsBase) : hlsBase,
    proxyBufferSize: String(streamsSettings.bufferSize ?? "512k"),
    readTimeout: Number(streamsSettings.readTimeout ?? 30),
    connectionTimeout: Number(streamsSettings.connectionTimeout ?? 10),
  };

  const rawStreams = await import("@/lib/prisma").then(({ prisma }) =>
    prisma.stream.findMany({
      where: { serverId, isActive: true, type: "LIVE" },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        autoRestart: true,
        type: true,
        agentStartCmd: true,
        agentPid: true,
        vodMode: true,
        isOnDemand: true,
        isCreatedChannel: true,
        hostedExternally: true,
      },
      orderBy: { sortOrder: "asc" },
    })
  );

  const { streamNeedsAlwaysOnProcess } = await import("@/lib/stream-playback-mode");
  const alwaysOnStreams = rawStreams.filter((s) => streamNeedsAlwaysOnProcess(s));

  const streams: AgentStreamEntry[] = alwaysOnStreams.map((s) => {
    const transcodeArgs =
      transcodeProfile && !s.agentStartCmd?.trim()
        ? buildGpuFfmpegArgs(
            transcodeProfile,
            s.streamUrl,
            String(transcodeSettings?.vaapiDevice ?? "/dev/dri/renderD128")
          )
        : undefined;
    return {
      id: s.id,
      name: s.name,
      streamUrl: s.streamUrl,
      autoRestart: s.autoRestart,
      type: s.type,
      startCmd: buildFfmpegStartCmd({
        ffmpegPath,
        inputUrl: s.streamUrl,
        streamId: s.id,
        serverId,
        preset: transcodeProfile?.preset ?? preset,
        threads,
        customCmd: s.agentStartCmd,
        transcodeArgs,
      }),
      stopCmd: buildFfmpegStopCmd(serverId, s.id),
      pidFile: agentPidFile(serverId, s.id),
      agentPid: s.agentPid,
    };
  });

  return {
    revision,
    nginx,
    nginxSnippet: buildNginxAgentSnippet(nginx),
    nginxSnippetPath: "/etc/nexlify-agent/nginx-snippet.conf",
    ffmpegPreset: transcodeProfile?.preset ?? preset,
    ffmpegThreads: threads,
    transcodingPack: transcodeProfile
      ? {
          enabled: true,
          profileId: transcodeProfile.id,
          gpuEncoder: transcodeProfile.gpuEncoder,
          ladderIds: transcodeLadder.map((p) => p.id),
        }
      : undefined,
    binRoot,
    nginxPath: String(binaries.nginxPath ?? paths.nginxPath),
    ffmpegPath,
    streams,
  };
}
