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

  const binRoot = String(binaries.binRoot ?? NEXLIFY_BIN_LAYOUT.binRoot);
  const paths = pathsFromBinRoot(binRoot);
  const ffmpegPath = String(binaries.ffmpegPath ?? paths.ffmpegPath);
  const preset = String(streamsSettings.transcodePreset ?? "veryfast");
  const threads = Number(streamsSettings.ffmpegThreadCount ?? 0);

  const nginx: AgentNginxConfig = {
    bufferLive: Boolean(streamsSettings.nginxBufferLive),
    bufferVod: Boolean(streamsSettings.nginxBufferVod),
    bufferCountLive: Number(streamsSettings.nginxBufferCountLive ?? 96),
    bufferCountVod: Number(streamsSettings.nginxBufferCountVod ?? 96),
    bufferSizeLive: String(streamsSettings.nginxBufferSizeLive ?? "32k"),
    bufferSizeVod: String(streamsSettings.nginxBufferSizeVod ?? "32k"),
    hlsSegmentDuration: Number(streamsSettings.hlsSegmentDuration ?? 6),
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
      },
      orderBy: { sortOrder: "asc" },
    })
  );

  const streams: AgentStreamEntry[] = rawStreams.map((s) => ({
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
      preset,
      threads,
      customCmd: s.agentStartCmd,
    }),
    stopCmd: buildFfmpegStopCmd(serverId, s.id),
    pidFile: agentPidFile(serverId, s.id),
    agentPid: s.agentPid,
  }));

  return {
    revision,
    nginx,
    nginxSnippet: buildNginxAgentSnippet(nginx),
    nginxSnippetPath: "/etc/nexlify-agent/nginx-snippet.conf",
    ffmpegPreset: preset,
    ffmpegThreads: threads,
    binRoot,
    nginxPath: String(binaries.nginxPath ?? paths.nginxPath),
    ffmpegPath,
    streams,
  };
}
