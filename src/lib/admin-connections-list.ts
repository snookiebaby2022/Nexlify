import type { SessionUser } from "@/lib/auth";
import {
  listLiveConnections,
  pruneStaleConnections,
  PLAYBACK_STALE_MS,
} from "@/lib/connections";
import { computeConnectionQualityWithLive, batchGetLiveQualitySamples } from "@/lib/connection-quality-live";
import {
  batchGetConnectionPlaybackOutputs,
  resolvePlaybackOutputLabel,
} from "@/lib/connection-playback-output";
import { streamServerDisplayName } from "@/lib/stream-server-display";
import { ownerScope } from "@/lib/owner-scope";

export type AdminConnectionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
  serverName: string;
  line: { username: string; maxConnections: number; isRestreamer?: boolean };
  stream: { id: string; name: string; type: string } | null;
  quality: ReturnType<typeof computeConnectionQualityWithLive>;
  output: ReturnType<typeof resolvePlaybackOutputLabel>;
};

export async function listAdminConnections(session: SessionUser): Promise<AdminConnectionRow[]> {
  void pruneStaleConnections(PLAYBACK_STALE_MS);
  const connections = await listLiveConnections(ownerScope(session));
  const now = Date.now();
  const qualityItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const outputItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const [liveSamples, cachedOutputs] = await Promise.all([
    batchGetLiveQualitySamples(qualityItems, now),
    batchGetConnectionPlaybackOutputs(outputItems),
  ]);
  return connections.map((c, i) => {
    const live = c.streamId ? liveSamples[i] : null;
    const quality = computeConnectionQualityWithLive({
      startedAt: c.startedAt,
      lastSeenAt: c.lastSeenAt,
      now,
      live,
    });
    const cachedOutput = c.streamId ? cachedOutputs[i] : null;
    const output = resolvePlaybackOutputLabel({
      cached: cachedOutput,
      userAgent: c.userAgent,
    });
    const srv = c.stream?.server;
    const serverName = srv
      ? streamServerDisplayName(srv.name, srv.domain || srv.host || "")
      : "Main Server";
    return {
      ...c,
      startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
      lastSeenAt: c.lastSeenAt instanceof Date ? c.lastSeenAt.toISOString() : String(c.lastSeenAt),
      serverName,
      quality,
      output,
    };
  });
}
