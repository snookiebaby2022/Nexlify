import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import { normalizeConnectionIp } from "@/lib/connections";
import { setViewerActiveStream, touchLiveSession } from "@/lib/live-session";
import { markStreamSpliceOk } from "@/lib/viewer-playback-probe";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";
import { refreshConnSlot } from "@/lib/connection-slots";

export type PulseBatchEntry = {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  idleMs?: number;
  onDemand?: boolean;
};

type NormalizedPulse = {
  lineId: string;
  streamId: string;
  ip: string;
  bytes: number;
  idleMs: number;
  onDemand: boolean;
};

/** Stable id for raw INSERT (Postgres @default(cuid()) is not available in $executeRaw). */
function newLiveConnectionId(): string {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function normalizeBatch(entries: PulseBatchEntry[]): NormalizedPulse[] {
  const byKey = new Map<string, NormalizedPulse>();
  for (const entry of entries) {
    const lineId = String(entry.lineId ?? "").trim();
    const streamId = String(entry.streamId ?? "").trim();
    if (!lineId || !streamId) continue;
    const ip = normalizeConnectionIp(entry.ip) || "";
    const key = `${lineId}\0${streamId}\0${ip}`;
    const bytes = Math.max(0, Math.floor(entry.bytes ?? 0));
    const idleMs = Math.max(0, Math.floor(entry.idleMs ?? 0));
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        lineId,
        streamId,
        ip,
        bytes,
        idleMs,
        onDemand: Boolean(entry.onDemand),
      });
      continue;
    }
    prev.bytes += bytes;
    prev.idleMs = Math.max(prev.idleMs, idleMs);
    prev.onDemand = prev.onDemand || Boolean(entry.onDemand);
  }
  return [...byKey.values()];
}

/**
 * Apply edge batched heartbeats in one (or few) SQL statements.
 * Avoids N× findUnique/upsert storms that reset :13000 under Postgres load.
 */
export async function pulseLiveConnectionBatch(entries: PulseBatchEntry[]): Promise<number> {
  const rows = normalizeBatch(entries);
  if (!rows.length) return 0;

  for (const row of rows) {
    if (row.bytes > 0 || row.idleMs > 0) {
      void recordConnectionMediaBytes(
        row.lineId,
        row.streamId,
        row.ip,
        row.bytes,
        row.idleMs,
        row.onDemand
      );
    }
    if (row.bytes > 0) void markStreamSpliceOk(row.streamId);
  }

  try {
    // Chunk VALUES to keep query size bounded (edge sends ≤80 per HTTP request).
    const CHUNK = 64;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const params: string[] = [];
      const valueSql: string[] = [];
      let p = 1;
      for (const row of slice) {
        valueSql.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(newLiveConnectionId(), row.lineId, row.streamId, row.ip);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LiveConnection" (id, "lineId", "streamId", ip, "startedAt", "lastSeenAt")
         VALUES ${valueSql.join(",")}
         ON CONFLICT ("lineId", "streamId", ip)
         DO UPDATE SET "lastSeenAt" = NOW()`,
        ...params
      );
    }
  } catch (err) {
    // Unique index missing / schema drift — fall back to per-row updates (still no findUnique).
    console.error(
      "[pulseLiveConnectionBatch] bulk upsert failed, falling back:",
      err instanceof Error ? err.message : err
    );
    await Promise.allSettled(
      rows.map((row) =>
        prisma.liveConnection
          .updateMany({
            where: { lineId: row.lineId, streamId: row.streamId, ip: row.ip },
            data: { lastSeenAt: new Date() },
          })
          .then(async (r) => {
            if (r.count > 0) return;
            await prisma.liveConnection
              .create({
                data: { lineId: row.lineId, streamId: row.streamId, ip: row.ip },
              })
              .catch(() => undefined);
          })
      )
    );
  }

  // Redis session/slot TTL refresh — fire-and-forget, bounded concurrency.
  const REDIS_CHUNK = 16;
  for (let i = 0; i < rows.length; i += REDIS_CHUNK) {
    const slice = rows.slice(i, i + REDIS_CHUNK);
    void Promise.allSettled(
      slice.flatMap((row) => [
        touchLiveSession(row.lineId, row.streamId, row.ip || null),
        setViewerActiveStream(row.lineId, row.streamId, row.ip || null),
        refreshConnSlot(row.lineId, { streamId: row.streamId, clientIp: row.ip }),
      ])
    );
  }

  notifyLiveConnectionsChanged();
  return rows.length;
}

/** Deterministic fingerprint for tests (not used in production path). */
export function pulseBatchDedupeKey(entry: PulseBatchEntry): string {
  const ip = normalizeConnectionIp(entry.ip) || "";
  return createHash("sha1")
    .update(`${entry.lineId}|${entry.streamId}|${ip}`)
    .digest("hex");
}
