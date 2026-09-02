import { pulseLiveConnection } from "@/lib/connection-pulse";

export type PulseBatchEntry = {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  idleMs?: number;
  onDemand?: boolean;
};

const MAX_BATCH = 512;

/** Apply edge batched heartbeats without one HTTP request per viewer. */
export async function pulseLiveConnectionBatch(entries: PulseBatchEntry[]): Promise<number> {
  const slice = entries.slice(0, MAX_BATCH);
  await Promise.all(
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
  return slice.length;
}
