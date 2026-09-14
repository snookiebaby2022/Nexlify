import { pulseLiveConnection } from "@/lib/connection-pulse";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";

export type PulseBatchEntry = {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  idleMs?: number;
  onDemand?: boolean;
};

const CHUNK = 32;

/** Apply edge batched heartbeats without one HTTP request per viewer. */
export async function pulseLiveConnectionBatch(entries: PulseBatchEntry[]): Promise<number> {
  let applied = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      slice.map((entry) =>
        pulseLiveConnection({
          lineId: entry.lineId,
          streamId: entry.streamId,
          ip: entry.ip,
          bytes: entry.bytes,
          idleMs: entry.idleMs,
          onDemand: entry.onDemand,
        })
      )
    );
    applied += results.filter((r) => r.status === "fulfilled").length;
  }
  if (applied) notifyLiveConnectionsChanged();
  return applied;
}
