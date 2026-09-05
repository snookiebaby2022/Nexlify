import { prisma } from "@/lib/prisma";
import { enqueueAgentCommand } from "@/lib/stream-agent";
import {
  getStreamPlaybackPolicy,
  streamNeedsAlwaysOnProcessPolicy,
  type StreamForPlaybackPolicy,
} from "@/lib/stream-playback-policy";
import type { VodMode } from "@prisma/client";

const START_COOLDOWN_MS = 5_000;
const startInflight = new Map<string, number>();

function agentCanStartUrl(url: string): boolean {
  const t = url.trim();
  return (
    /^https?:\/\//i.test(t) &&
    !t.includes("127.0.0.1") &&
    !/localhost/i.test(t) &&
    !t.startsWith("file://") &&
    !t.startsWith("nexlify://") &&
    !t.startsWith("pending://")
  );
}

/** XUI-style: start ffmpeg on the streaming server when a viewer opens an on-demand channel. */
export async function ensureOnDemandStreamStarted(
  stream: {
    id: string;
    serverId: string | null;
    type?: string | null;
    vodMode: string | VodMode;
    isOnDemand: boolean;
    isCreatedChannel: boolean;
    agentStartCmd: string | null;
    autoRestart: boolean;
    streamUrl: string;
    hostedExternally: boolean;
  }
): Promise<void> {
  const forMode: StreamForPlaybackPolicy = {
    vodMode: stream.vodMode as VodMode,
    isOnDemand: stream.isOnDemand,
    isCreatedChannel: stream.isCreatedChannel,
    agentStartCmd: stream.agentStartCmd,
    autoRestart: stream.autoRestart,
    streamUrl: stream.streamUrl,
    hostedExternally: stream.hostedExternally,
  };
  const mode = getStreamPlaybackPolicy(forMode);
  if (mode === "direct" || mode === "relay") return;
  // Movies/series and plex/integration URLs must never queue ffmpeg start_stream —
  // the stream agent only runs always-on LIVE processes.
  if (stream.type && stream.type !== "LIVE") return;
  if (!agentCanStartUrl(stream.streamUrl || "")) return;
  // Agent poll.json only includes always-on / running processes. Queuing start for
  // anything else always returns "cmd failed" and floods 10gbs.
  if (!streamNeedsAlwaysOnProcessPolicy(forMode) && mode !== "on_demand" && mode !== "created") {
    return;
  }
  // on_demand/created still need an agent config entry; without always-on policy the
  // agent cannot resolve ffmpegArgs — skip rather than spam cmd failed.
  if (!streamNeedsAlwaysOnProcessPolicy(forMode)) return;

  if (!stream.serverId) return;

  const key = `${stream.serverId}:${stream.id}`;
  const last = startInflight.get(key) ?? 0;
  if (Date.now() - last < START_COOLDOWN_MS) return;
  startInflight.set(key, Date.now());

  const running = await prisma.streamProcess.findFirst({
    where: {
      serverId: stream.serverId,
      streamId: stream.id,
      status: "running",
      lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  if (running) return;

  await enqueueAgentCommand(stream.serverId, "start_stream", { streamId: stream.id });
}
