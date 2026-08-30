import { prisma } from "@/lib/prisma";
import { findSiblingLiveBackupUrl } from "@/lib/live-channel-backup";
import {
  PLAYBACK_DROP,
  PLAYBACK_FAILOVER,
  PLAYBACK_FREEZE,
  PLAYBACK_ORIGIN_FAIL,
  PLAYBACK_STUTTER,
  logPlaybackQuality,
} from "@/lib/playback-quality-log";
import { setActiveFailover } from "@/lib/source-failover";
import { probeStreamUrl } from "@/lib/stream-probe-server";

export type PlaybackQualityScan = {
  watched: number;
  drops: number;
  freezes: number;
  stutters: number;
  failovers: number;
};

function classifyWatch(row: {
  sessions: number;
  under30s: number;
  under2m: number;
  avgSec: number;
  stillFresh: number;
}): "drop" | "freeze" | "stutter" | null {
  if (row.sessions >= 3 && row.under30s / row.sessions >= 0.4) return "drop";
  if (row.sessions >= 2 && row.stillFresh === 0 && row.avgSec >= 60 && row.under30s / row.sessions < 0.3) {
    return "freeze";
  }
  if (row.sessions >= 3 && row.under2m / row.sessions >= 0.5 && row.under30s / row.sessions < 0.4) {
    return "stutter";
  }
  return null;
}

export function classifyWatchRowForTest(row: Parameters<typeof classifyWatch>[0]) {
  return classifyWatch(row);
}

async function ensureBackupAndFailover(
  stream: { id: string; name: string; streamUrl: string; backupUrl: string | null }
): Promise<boolean> {
  let backup = stream.backupUrl?.trim() || "";
  if (!backup) {
    backup = (await findSiblingLiveBackupUrl(stream)) ?? "";
    if (backup) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: { backupUrl: backup },
      });
    }
  }
  if (!backup || backup === stream.streamUrl.trim()) return false;
  const probe = await probeStreamUrl(backup, { fast: false });
  if (probe.status !== "online" && probe.status !== "degraded") return false;
  await setActiveFailover(stream.id, backup, 600);
  await logPlaybackQuality({
    action: PLAYBACK_FAILOVER,
    streamId: stream.id,
    streamName: stream.name,
    detail: "Switched viewers to a working backup without disabling the channel",
    meta: { backupHost: (() => { try { return new URL(backup).host; } catch { return ""; } })() },
  });
  return true;
}

export async function runPlaybackQualityMonitor(): Promise<PlaybackQualityScan> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      streamUrl: string;
      backupUrl: string | null;
      sessions: number;
      under30s: number;
      under2m: number;
      avgSec: number;
      stillFresh: number;
    }[]
  >`
    SELECT s.id, s.name, s."streamUrl", s."backupUrl",
      COUNT(*)::int AS sessions,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (lc."lastSeenAt" - lc."startedAt")) < 30
      )::int AS "under30s",
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (lc."lastSeenAt" - lc."startedAt")) < 120
      )::int AS "under2m",
      COALESCE(ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (lc."lastSeenAt" - lc."startedAt")))))::int, 0) AS "avgSec",
      COUNT(*) FILTER (
        WHERE lc."lastSeenAt" >= NOW() - INTERVAL '3 minutes'
      )::int AS "stillFresh"
    FROM "LiveConnection" lc
    JOIN "Stream" s ON s.id = lc."streamId"
    WHERE lc."lastSeenAt" >= NOW() - INTERVAL '20 minutes'
      AND s.type = 'LIVE'
      AND s."isActive" = true
    GROUP BY s.id, s.name, s."streamUrl", s."backupUrl"
    ORDER BY COUNT(*) DESC
    LIMIT 12
  `;

  const out: PlaybackQualityScan = {
    watched: rows.length,
    drops: 0,
    freezes: 0,
    stutters: 0,
    failovers: 0,
  };

  for (const row of rows) {
    const kind = classifyWatch(row);
    if (kind === "drop") {
      out.drops++;
      await logPlaybackQuality({
        action: PLAYBACK_DROP,
        streamId: row.id,
        streamName: row.name,
        detail: `${row.under30s}/${row.sessions} sessions died in under 30s`,
        meta: { sessions: row.sessions, under30s: row.under30s },
      });
    } else if (kind === "freeze") {
      out.freezes++;
      await logPlaybackQuality({
        action: PLAYBACK_FREEZE,
        streamId: row.id,
        streamName: row.name,
        detail: "Watchers stopped receiving pulses — stream likely froze or went off",
        meta: { sessions: row.sessions, avgSec: row.avgSec },
      });
    } else if (kind === "stutter") {
      out.stutters++;
      await logPlaybackQuality({
        action: PLAYBACK_STUTTER,
        streamId: row.id,
        streamName: row.name,
        detail: `${row.under2m}/${row.sessions} sessions lasted under 2 minutes`,
        meta: { sessions: row.sessions, under2m: row.under2m },
      });
    }

    if (!kind) continue;

    const primary = await probeStreamUrl(row.streamUrl, { fast: false });
    const primaryOk = primary.status === "online" || primary.status === "degraded";
    if (!primaryOk) {
      await logPlaybackQuality({
        action: PLAYBACK_ORIGIN_FAIL,
        streamId: row.id,
        streamName: row.name,
        detail: primary.message ?? "Primary origin failed",
      });
      try {
        await prisma.streamIssue.create({
          data: {
            streamId: row.id,
            issueType: kind === "freeze" ? "freeze" : kind === "stutter" ? "bitrate_drop" : "source_down",
            severity: "warning",
          },
        });
      } catch {
        /* ignore */
      }
    }
    if (await ensureBackupAndFailover(row)) out.failovers++;
  }

  return out;
}
