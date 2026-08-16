import { prisma } from "@/lib/prisma";
import { enqueueAgentCommand } from "@/lib/stream-agent";
import { getStreamPlaybackMode, type StreamForPlaybackMode } from "@/lib/stream-playback-mode";
import type { VodMode } from "@prisma/client";

const START_COOLDOWN_MS = 15_000;
const startInflight = new Map<string, number>();

/** XUI-style: start ffmpeg on the streaming server when a viewer opens an on-demand channel. */
export async function ensureOnDemandStreamStarted(
  stream: {
    id: string;
    serverId: string | null;
    vodMode: string | VodMode;
    isOnDemand: boolean;
    isCreatedChannel: boolean;
    agentStartCmd: string | null;
    autoRestart: boolean;
    streamUrl: string;
    hostedExternally: boolean;
  }
): Promise<void> {
  const forMode: StreamForPlaybackMode = {
    vodMode: stream.vodMode as VodMode,
    isOnDemand: stream.isOnDemand,
    isCreatedChannel: stream.isCreatedChannel,
    agentStartCmd: stream.agentStartCmd,
    autoRestart: stream.autoRestart,
    streamUrl: stream.streamUrl,
    hostedExternally: stream.hostedExternally,
  };
  const mode = getStreamPlaybackMode(forMode);
  if (mode !== "on_demand" && mode !== "created" && mode !== "catchup") return;
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
