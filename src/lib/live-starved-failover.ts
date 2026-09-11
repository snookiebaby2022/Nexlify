/**
 * Starved-origin auto-failover for LIVE:
 * If primary stays offline / sub-~2 Mbps for CONFIRM_MS, permanently swap
 * to a healthy backup (or sibling), XUI-style — one working source in the catalog.
 */
import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { cacheDelExact, cacheGet, cacheSet } from "@/lib/cache";
import { findSiblingLiveBackupUrl } from "@/lib/live-channel-backup";
import { probeStreamWithScheduler } from "@/lib/source-probe-scheduler";
import { setActiveFailover } from "@/lib/source-failover";
import { liveUpstreamKey, isBadLiveHostUrl } from "@/lib/live-fleet-heal";

/** Below this sustained probe bitrate, treat as tinypanel-class starvation. */
export const LIVE_STARVED_KBPS = 2000;
/** Primary must stay bad this long before permanent swap. */
export const LIVE_STARVED_CONFIRM_MS = 10 * 60 * 1000;
const CONFIRM_KEY = (id: string) => `live-starved:confirm:${id}`;
const MAX_PER_RUN = 10;
/** Hard ceiling so one hung origin cannot block the cron minute job. */
const PROBE_HARD_TIMEOUT_MS = Number(process.env.LIVE_STARVED_PROBE_TIMEOUT_MS || 12_000);
const RUN_BUDGET_MS = Number(process.env.LIVE_STARVED_BUDGET_MS || 45_000);

async function probeWithHardTimeout(opts: {
  streamId: string;
  url: string;
}): Promise<{ probe: { status: string; bitrateKbps?: number; message?: string }; skipped: boolean; reason?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      // Fast HTTP probe only — ffprobe on live IPTV origins routinely hangs past 18s.
      probeStreamWithScheduler({ ...opts, fast: true }),
      new Promise<{ probe: { status: string; message: string }; skipped: true; reason: string }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              probe: { status: "offline", message: "probe hard-timeout" },
              skipped: true,
              reason: "hard_timeout",
            }),
          Math.max(3_000, PROBE_HARD_TIMEOUT_MS)
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ProbeLike = {
  status: string;
  bitrateKbps?: number;
  message?: string;
};

export function isProbeStarved(probe: ProbeLike): boolean {
  if (probe.status === "offline" || probe.status === "unknown") return true;
  if (
    typeof probe.bitrateKbps === "number" &&
    probe.bitrateKbps > 0 &&
    probe.bitrateKbps < LIVE_STARVED_KBPS
  ) {
    return true;
  }
  return false;
}

export function isProbeHealthy(probe: ProbeLike): boolean {
  if (probe.status !== "online" && probe.status !== "degraded") return false;
  if (typeof probe.bitrateKbps === "number" && probe.bitrateKbps > 0) {
    return probe.bitrateKbps >= LIVE_STARVED_KBPS;
  }
  // HTTP-online without bitrate: accept for failover target (better than starved primary)
  return probe.status === "online";
}

export type LiveStarvedFailoverResult = {
  scanned: number;
  starvedSeen: number;
  waitingConfirm: number;
  swapped: number;
  samples: { name: string; fromHost: string; toHost: string; reason: string }[];
};

function hostSafe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

async function permanentSwapPrimary(
  streamId: string,
  name: string,
  oldPrimary: string,
  newPrimary: string,
  reason: string
): Promise<void> {
  await prisma.stream.update({
    where: { id: streamId },
    data: {
      streamUrl: newPrimary,
      backupUrl: oldPrimary === newPrimary ? null : oldPrimary,
      isOnDemand: true,
      vodMode: "ON_DEMAND",
      autoRestart: false,
      lastProbeOk: true,
      lastProbeAt: new Date(),
      lastProbeError: null,
    },
  });
  await prisma.liveConnection.deleteMany({ where: { streamId } });
  await setActiveFailover(streamId, newPrimary, 600).catch(() => undefined);
  await cacheDelExact(CONFIRM_KEY(streamId)).catch(() => undefined);
  try {
    await prisma.streamIssue.create({
      data: {
        streamId,
        issueType: "bitrate_drop",
        severity: "warning",
        autoFixed: true,
        fixAction: "source_swap",
        fixResult: `${name}: ${reason} → ${hostSafe(newPrimary)}`.slice(0, 480),
      },
    });
  } catch {
    /* ignore */
  }
}

export async function runLiveStarvedFailover(opts?: {
  limit?: number;
}): Promise<LiveStarvedFailoverResult> {
  const limit = Math.max(1, Math.min(30, opts?.limit ?? MAX_PER_RUN));
  const out: LiveStarvedFailoverResult = {
    scanned: 0,
    starvedSeen: 0,
    waitingConfirm: 0,
    swapped: 0,
    samples: [],
  };

  const since = new Date(Date.now() - 20 * 60 * 1000);
  const hot = await prisma.$queryRaw<
    { id: string; name: string; streamUrl: string; backupUrl: string | null; viewers: number }[]
  >`
    SELECT s.id, s.name, s."streamUrl", s."backupUrl",
      COUNT(*)::int AS viewers
    FROM "LiveConnection" lc
    JOIN "Stream" s ON s.id = lc."streamId"
    WHERE lc."lastSeenAt" >= ${since}
      AND s.type = 'LIVE'
      AND s."isActive" = true
      AND s."isRadio" = false
    GROUP BY s.id, s.name, s."streamUrl", s."backupUrl"
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;

  const ids = new Set(hot.map((h) => h.id));
  if (hot.length < limit) {
    const extras = await prisma.stream.findMany({
      where: {
        type: StreamType.LIVE,
        isActive: true,
        isRadio: false,
        id: { notIn: [...ids] },
        OR: [{ lastProbeOk: false }, { lastSpliceOk: false }],
        updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      select: { id: true, name: true, streamUrl: true, backupUrl: true },
      take: limit - hot.length,
      orderBy: { updatedAt: "desc" },
    });
    for (const e of extras) {
      hot.push({ ...e, viewers: 0 });
    }
  }

  const startedAt = Date.now();
  for (const row of hot) {
    if (Date.now() - startedAt >= RUN_BUDGET_MS) break;
    out.scanned++;
    if (isBadLiveHostUrl(row.streamUrl)) {
      // Catalog heal owns bad hosts; still try immediate sibling swap here.
    }

    const primaryResult = await probeWithHardTimeout({
      streamId: row.id,
      url: row.streamUrl,
    });
    if (primaryResult.skipped) continue;

    const primary = primaryResult.probe;
    await prisma.stream
      .update({
        where: { id: row.id },
        data: {
          lastProbeAt: new Date(),
          lastProbeOk: !isProbeStarved(primary) && (primary.status === "online" || primary.status === "degraded"),
          lastProbeError: isProbeStarved(primary) ? primary.message?.slice(0, 240) ?? "starved" : null,
        },
      })
      .catch(() => undefined);

    if (!isProbeStarved(primary)) {
      await cacheDelExact(CONFIRM_KEY(row.id)).catch(() => undefined);
      continue;
    }

    out.starvedSeen++;
    const prev = (await cacheGet<{ firstAt: number }>(CONFIRM_KEY(row.id))) ?? null;
    const firstAt = prev?.firstAt ?? Date.now();
    if (!prev) {
      await cacheSet(CONFIRM_KEY(row.id), { firstAt }, Math.ceil((LIVE_STARVED_CONFIRM_MS * 3) / 1000));
      out.waitingConfirm++;
      continue;
    }
    if (Date.now() - firstAt < LIVE_STARVED_CONFIRM_MS) {
      out.waitingConfirm++;
      continue;
    }

    let candidate = row.backupUrl?.trim() || "";
    if (!candidate || candidate === row.streamUrl.trim() || isBadLiveHostUrl(candidate)) {
      candidate = (await findSiblingLiveBackupUrl(row)) ?? "";
    }
    if (!candidate || liveUpstreamKey(candidate) === liveUpstreamKey(row.streamUrl)) {
      continue;
    }

    if (Date.now() - startedAt >= RUN_BUDGET_MS) break;
    const bakResult = await probeWithHardTimeout({
      streamId: row.id,
      url: candidate,
    });
    if (bakResult.skipped || !isProbeHealthy(bakResult.probe)) continue;

    const reason =
      typeof primary.bitrateKbps === "number"
        ? `primary ${primary.bitrateKbps}kbps < ${LIVE_STARVED_KBPS}`
        : `primary ${primary.status}`;

    await permanentSwapPrimary(row.id, row.name, row.streamUrl, candidate, reason);
    out.swapped++;
    if (out.samples.length < 12) {
      out.samples.push({
        name: row.name,
        fromHost: hostSafe(row.streamUrl),
        toHost: hostSafe(candidate),
        reason,
      });
    }
  }

  return out;
}
