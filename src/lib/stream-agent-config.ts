import { getSettingGroup } from "@/lib/panel-settings";
import { pathsFromBinRoot, NEXLIFY_BIN_LAYOUT } from "@/lib/bin-paths-layout";
import { buildFfmpegArgv, buildFfmpegStartCmd, buildFfmpegStopCmd } from "@/lib/ffmpeg-agent";
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
  ffmpegPath: string;
  ffmpegArgs: string[];
  pidFile: string;
  logFile: string;
  startCmd: string;
  stopCmd: string;
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
  rollingArchive?: {
    streamId: string;
    name: string;
    retentionDays: number;
    storagePath: string;
  }[];
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
  if (transcodeEnabled && transcodeSettings && transcodeSettings.enabled !== false) {
    const ladderId = String(serverPerf.transcodeProfileId || transcodeSettings.ladderProfile || "1080p-nvenc");
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
    readTimeout: Number(streamsSettings.readTimeout ?? 35),
    connectionTimeout: Number(streamsSettings.connectionTimeout ?? 8),
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
        archiveDays: true,
        isOnDemand: true,
        isCreatedChannel: true,
        hostedExternally: true,
      },
      orderBy: { sortOrder: "asc" },
    })
  );

  const { streamNeedsAlwaysOnProcessPolicy } = await import("@/lib/stream-playback-policy");
  const { parseLiveStreamMeta } = await import("@/lib/stream-live-meta");
  const { FFMPEG_TRANSCODE_PROFILES, buildFfmpegTranscodeArgs } = await import("@/lib/ffmpeg-transcode-profiles");
  const runningProcStreams = await prisma.stream.findMany({
    where: {
      serverId,
      processes: { some: { status: { in: ["running", "restarting", "unknown"] } } },
    },
    select: { id: true },
  });
  const keepIds = new Set([
    ...rawStreams.filter((s) => streamNeedsAlwaysOnProcessPolicy(s)).map((s) => s.id),
    ...runningProcStreams.map((s) => s.id),
  ]);
  const alwaysOnStreams = rawStreams.filter((s) => keepIds.has(s.id));

  const { applyVideoOverlayFilter, getOverlaySettings, captureDeviceInputArgs } = await import("@/lib/ffmpeg-overlay");
  const overlay = await getOverlaySettings();
  const panelName = String((await getSettingGroup("general")).panelName ?? "Nexlify");

  const streams: AgentStreamEntry[] = alwaysOnStreams.map((s) => {
    const liveMeta = parseLiveStreamMeta(s.agentStartCmd);
    const cpuProfile =
      liveMeta.transcodeProfile && liveMeta.transcodeProfile !== "none"
        ? FFMPEG_TRANSCODE_PROFILES.find((p) => p.id === liveMeta.transcodeProfile)
        : undefined;
    const capture = captureDeviceInputArgs(s.streamUrl);
    const transcodeArgs =
      capture
        ? undefined
        : cpuProfile
        ? buildFfmpegTranscodeArgs(cpuProfile, s.streamUrl)
        : transcodeProfile && transcodeSettings
          ? buildGpuFfmpegArgs(
              transcodeProfile,
              s.streamUrl,
              String(transcodeSettings.vaapiDevice ?? "/dev/dri/renderD128")
            )
          : undefined;
    const spec = buildFfmpegArgv({
      ffmpegPath,
      inputUrl: s.streamUrl,
      streamId: s.id,
      serverId,
      preset: cpuProfile?.preset ?? transcodeProfile?.preset ?? preset,
      threads,
      transcodeArgs,
    });
    if (overlay.enabled) {
      spec.args = applyVideoOverlayFilter(spec.args, overlay, {
        streamName: s.name,
        panelName,
      });
    }
    return {
      id: s.id,
      name: s.name,
      streamUrl: s.streamUrl,
      autoRestart: s.autoRestart,
      type: s.type,
      ffmpegPath: spec.ffmpegPath,
      ffmpegArgs: spec.args,
      pidFile: spec.pidFile,
      logFile: spec.logFile,
      startCmd: buildFfmpegStartCmd(spec),
      stopCmd: buildFfmpegStopCmd(serverId, s.id),
      agentPid: s.agentPid,
    };
  });

  const { isArchivePackEnabled } = await import("@/lib/archive-recorder");
  const archiveEnabled = await isArchivePackEnabled();
  const archiveSettings = archiveEnabled ? await getSettingGroup("archive-pack" as never) : null;
  const archiveStorage = String(archiveSettings?.storagePath ?? "/var/nexlify/archive");
  const defaultRetention = Number(archiveSettings?.defaultRetentionDays ?? 7);
  const rollingArchive = archiveEnabled
    ? rawStreams
        .filter(
          (s) =>
            s.vodMode === "CATCHUP" ||
            (s.archiveDays != null && Number(s.archiveDays) > 0)
        )
        .map((s) => ({
          streamId: s.id,
          name: s.name,
          retentionDays: s.archiveDays ?? defaultRetention,
          storagePath: `${archiveStorage}/${s.id}`,
        }))
    : undefined;

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
    rollingArchive,
    binRoot,
    nginxPath: String(binaries.nginxPath ?? paths.nginxPath),
    ffmpegPath,
    streams,
  };
}
