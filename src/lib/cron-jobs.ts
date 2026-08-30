import { prisma } from "./prisma";
import { StreamType } from "@prisma/client";
import { LIVE_STALE_MS, listActiveConnections, countActiveConnections, deleteStaleConnections } from "./connections";
import { importFromFolder } from "./import-media";
import { syncEpgSource } from "./epg";
import { enqueueAgentCommand, generateAgentToken } from "./stream-agent";
import { runPanelBackup } from "./backup-run";
import { reassignStreamsFromOfflineServers, rebalanceLiveStreamsAcrossServers } from "./server-load";
import { jobCheckStreamCerts } from "./cert-monitor";
import { isRemoteM3uUrl } from "./m3u-watch-sync";
import { runDueM3uSyncJobs, runWatchFolderM3uSync } from "./m3u-sync-jobs";
import { getSettingGroup } from "./panel-settings";

const ESTIMATED_MBPS_PER_STREAM = Number(process.env.ESTIMATED_MBPS_PER_STREAM ?? "4");

async function logCron(job: string, status: string, message?: string, durationMs?: number) {
  await prisma.cronRunLog.create({
    data: { job, status, message, durationMs },
  });
  await prisma.panelSetting.upsert({
    where: { key: "cron_last_run" },
    update: { value: new Date().toISOString() },
    create: { key: "cron_last_run", value: new Date().toISOString() },
  });
}

export async function jobCleanupConnections() {
  const start = Date.now();
  try {
    const deleted = await deleteStaleConnections();
    await listActiveConnections();
    await logCron(
      "cleanup_connections",
      "ok",
      deleted.count ? `removed ${deleted.count} stale connection(s)` : undefined,
      Date.now() - start
    );
  } catch (e) {
    await logCron("cleanup_connections", "error", String(e), Date.now() - start);
  }
}

export async function jobStopIdleStreams() {
  const start = Date.now();
  try {
    const viewerFresh = new Date(Date.now() - Math.max(LIVE_STALE_MS, 60_000));
    const runningProcesses = await prisma.streamProcess.findMany({
      where: {
        status: { in: ["running", "restarting", "unknown"] },
      },
      select: {
        id: true,
        streamId: true,
        serverId: true,
        stream: {
          select: {
            vodMode: true,
            isOnDemand: true,
            isCreatedChannel: true,
            agentStartCmd: true,
            autoRestart: true,
            streamUrl: true,
            hostedExternally: true,
          },
        },
      },
      take: 800,
    });

    const streamIds = [...new Set(runningProcesses.map((p) => p.streamId).filter(Boolean))] as string[];
    const viewerRows =
      streamIds.length > 0
        ? await prisma.liveConnection.groupBy({
            by: ["streamId"],
            where: {
              streamId: { in: streamIds },
              lastSeenAt: { gte: viewerFresh },
            },
            _count: true,
          })
        : [];
    const viewers = new Map(viewerRows.map((r) => [r.streamId, r._count]));

    const { getStreamPlaybackPolicy, shouldStopIdleAgentProcess } = await import("./stream-playback-policy");
    const MAX_STOPS = 200;
    let stopped = 0;
    const queued = new Set<string>();

    for (const proc of runningProcesses) {
      if (stopped >= MAX_STOPS) break;
      const viewerCount = proc.streamId ? (viewers.get(proc.streamId) ?? 0) : 0;
      const mode = proc.stream ? getStreamPlaybackPolicy(proc.stream) : "relay";
      if (!shouldStopIdleAgentProcess(mode, viewerCount)) continue;

      await prisma.streamProcess.update({
        where: { id: proc.id },
        data: { status: "stopped", errorMessage: "Stopped — no viewers" },
      });
      const key = `${proc.serverId}:${proc.streamId ?? proc.id}`;
      if (proc.streamId && !queued.has(key)) {
        queued.add(key);
        await enqueueAgentCommand(proc.serverId, "stop_stream", { streamId: proc.streamId });
      }
      stopped++;
    }

    await logCron("stop_idle_streams", "ok", `stopped ${stopped} idle streams`, Date.now() - start);
  } catch (e) {
    await logCron("stop_idle_streams", "error", String(e), Date.now() - start);
  }
}

export async function jobBandwidthSnapshot() {
  const start = Date.now();
  try {
    // Use count instead of loading all rows into memory
    const count = await countActiveConnections();
    const bytesOutPerSec = (count * ESTIMATED_MBPS_PER_STREAM * 1_000_000) / 8;
    const bytesOut = BigInt(Math.floor(bytesOutPerSec * 60));
    const bytesIn = BigInt(Math.floor(Number(bytesOut) / 10));

    await prisma.bandwidthSnapshot.create({
      data: {
        bytesIn,
        bytesOut,
        connections: count,
      },
    });

    const inKey = "network_bytes_in_total";
    const outKey = "network_bytes_out_total";
    const prevIn = await prisma.panelSetting.findUnique({ where: { key: inKey } });
    const prevOut = await prisma.panelSetting.findUnique({ where: { key: outKey } });
    const totalIn = BigInt(prevIn?.value ?? "0") + bytesIn;
    const totalOut = BigInt(prevOut?.value ?? "0") + bytesOut;

    await prisma.panelSetting.upsert({
      where: { key: inKey },
      update: { value: totalIn.toString() },
      create: { key: inKey, value: totalIn.toString() },
    });
    await prisma.panelSetting.upsert({
      where: { key: outKey },
      update: { value: totalOut.toString() },
      create: { key: outKey, value: totalOut.toString() },
    });

    const old = new Date(Date.now() - 48 * 3600 * 1000);
    await prisma.bandwidthSnapshot.deleteMany({ where: { createdAt: { lt: old } } });

    await logCron("bandwidth_snapshot", "ok", `${count} streams`, Date.now() - start);
  } catch (e) {
    await logCron("bandwidth_snapshot", "error", String(e), Date.now() - start);
  }
}

export async function jobWatchFolders() {
  const start = Date.now();
  try {
    const folders = await prisma.watchFolder.findMany({ where: { isActive: true } });
    let queued = 0;

    for (const folder of folders) {
      if (folder.autoScanMins <= 0) continue;
      const due =
        !folder.lastScan ||
        Date.now() - folder.lastScan.getTime() >= folder.autoScanMins * 60 * 1000;
      if (!due) continue;

      const pending = await prisma.importJob.count({
        where: { watchFolderId: folder.id, status: { in: ["queued", "running"] } },
      });
      if (pending > 0) continue;

      const streamType: StreamType =
        folder.type === "SERIES"
          ? StreamType.SERIES
          : folder.type === "MOVIE"
            ? StreamType.MOVIE
            : folder.type === "LIVE"
              ? StreamType.LIVE
              : StreamType.MOVIE;

      await prisma.importJob.create({
        data: {
          kind: "WATCH_SCAN",
          source: folder.path,
          streamType,
          status: "queued",
          watchFolderId: folder.id,
          categoryId: folder.categoryId,
          serverId: folder.serverId,
        },
      });

      await prisma.watchFolder.update({
        where: { id: folder.id },
        data: { lastScan: new Date() },
      });
      queued++;
    }

    await logCron("watch_folders", "ok", `queued ${queued}`, Date.now() - start);
  } catch (e) {
    await logCron("watch_folders", "error", String(e), Date.now() - start);
  }
}

export async function jobImportQueue() {
  const start = Date.now();
  try {
    const job = await prisma.importJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) {
      await logCron("import_queue", "ok", "idle", Date.now() - start);
      return;
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date() },
    });

    let mode: "MOVIE" | "SERIES" | "MIXED" =
      job.streamType === "SERIES" ? "SERIES" : job.streamType === "MOVIE" ? "MOVIE" : "MIXED";

    let watchFolder: { type: string; path: string } | null = null;
    if (job.watchFolderId) {
      watchFolder = await prisma.watchFolder.findUnique({
        where: { id: job.watchFolderId },
        select: { type: true, path: true },
      });
      if (watchFolder?.type === "MIXED") mode = "MIXED";
      else if (watchFolder?.type === "SERIES") mode = "SERIES";
      else if (watchFolder?.type === "MOVIE") mode = "MOVIE";
    }

    let result = { imported: 0, skipped: 0 };
    try {
      if (watchFolder && isRemoteM3uUrl(job.source)) {
        result = await runWatchFolderM3uSync({
          id: job.watchFolderId!,
          name: "",
          path: job.source,
          type: watchFolder.type,
          categoryId: job.categoryId,
          serverId: job.serverId,
        });
      } else {
        result = await importFromFolder(job.source, {
          mode,
          categoryId: job.categoryId,
          serverId: job.serverId,
          allowedRoot: process.env.MEDIA_IMPORT_ROOT,
        });
      }
    } catch (e) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          message: String(e),
          completedAt: new Date(),
        },
      });
      await logCron("import_queue", "error", String(e), Date.now() - start);
      return;
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        imported: result.imported,
        skipped: result.skipped,
        message: `Imported ${result.imported}, skipped ${result.skipped}`,
        completedAt: new Date(),
      },
    });

    if (job.watchFolderId) {
      await prisma.watchFolder.update({
        where: { id: job.watchFolderId },
        data: { importedCount: { increment: result.imported } },
      });
    }

    await logCron("import_queue", "ok", job.id, Date.now() - start);
  } catch (e) {
    await logCron("import_queue", "error", String(e), Date.now() - start);
  }
}

export async function jobAgentAutoRestart() {
  const start = Date.now();
  try {
    const staleBefore = new Date(Date.now() - 120_000);
    const giveUpBefore = new Date(Date.now() - 15 * 60 * 1000);

    const expired = await prisma.streamProcess.updateMany({
      where: {
        lastSeenAt: { lt: giveUpBefore },
        status: { in: ["running", "restarting", "unknown"] },
      },
      data: {
        status: "stopped",
        errorMessage: "Agent heartbeat lost — process cleared",
      },
    });

    const stale = await prisma.streamProcess.findMany({
      where: {
        lastSeenAt: { lt: staleBefore, gte: giveUpBefore },
        status: { in: ["running", "unknown"] },
        autoRestart: true,
        streamId: { not: null },
      },
      include: {
        stream: {
          select: {
            autoRestart: true,
            serverId: true,
            vodMode: true,
            isOnDemand: true,
            isCreatedChannel: true,
            agentStartCmd: true,
            streamUrl: true,
            hostedExternally: true,
          },
        },
        server: { select: { agentToken: true, id: true, healthStatus: true } },
      },
      take: 20,
    });

    const viewerFresh = new Date(Date.now() - Math.max(LIVE_STALE_MS, 60_000));
    const staleIds = stale.map((p) => p.streamId).filter(Boolean) as string[];
    const viewerRows =
      staleIds.length > 0
        ? await prisma.liveConnection.groupBy({
            by: ["streamId"],
            where: { streamId: { in: staleIds }, lastSeenAt: { gte: viewerFresh } },
            _count: true,
          })
        : [];
    const viewersByStream = new Map(viewerRows.map((r) => [r.streamId, r._count]));
    const { getStreamPlaybackPolicy, shouldStopIdleAgentProcess } = await import("./stream-playback-policy");

    let restarted = 0;
    for (const proc of stale) {
      if (!proc.stream?.autoRestart || !proc.server?.agentToken || !proc.streamId) continue;
      const health = String(proc.server.healthStatus ?? "").toLowerCase();
      if (health === "offline" || health === "down") continue;
      const mode = getStreamPlaybackPolicy(proc.stream);
      if (shouldStopIdleAgentProcess(mode, viewersByStream.get(proc.streamId) ?? 0)) continue;
      const pending = await prisma.agentCommand.findFirst({
        where: {
          serverId: proc.serverId,
          action: "restart_stream",
          status: "pending",
        },
        select: { id: true },
      });
      if (!pending) {
        await enqueueAgentCommand(proc.serverId, "restart_stream", { streamId: proc.streamId });
      }
      await prisma.streamProcess.update({
        where: { id: proc.id },
        data: { status: "restarting", errorMessage: "Auto-restart queued" },
      });
      restarted++;
    }

    const offlineBefore = new Date(Date.now() - 300_000);
    await prisma.streamServer.updateMany({
      where: {
        agentToken: { not: null },
        agentLastSeen: { lt: offlineBefore },
        healthStatus: "online",
      },
      data: {
        healthStatus: "offline",
        healthMessage: "Agent not seen for 5+ minutes",
      },
    });

    await logCron(
      "agent_auto_restart",
      "ok",
      `${restarted} queued, ${expired.count} stale cleared`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("agent_auto_restart", "error", String(e), Date.now() - start);
  }
}

export async function jobEpgSync() {
  const start = Date.now();
  try {
    const sources = await prisma.epgSource.findMany({ where: { isActive: true } });
    const now = Date.now();
    let ok = 0;
    let skipped = 0;
    for (const s of sources) {
      const hours = s.syncEveryHours > 0 ? s.syncEveryHours : 24;
      const due =
        !s.lastSync || now - s.lastSync.getTime() >= hours * 3600 * 1000;
      if (!due) {
        skipped++;
        continue;
      }
      try {
        await syncEpgSource(s.id);
        await prisma.epgSource.update({
          where: { id: s.id },
          data: { lastSyncError: null },
        });
        ok++;
      } catch (e) {
        await prisma.epgSource.update({
          where: { id: s.id },
          data: { lastSyncError: String(e) },
        });
      }
    }
    await logCron("epg_sync", "ok", `synced ${ok}, skipped ${skipped}`, Date.now() - start);
  } catch (e) {
    await logCron("epg_sync", "error", String(e), Date.now() - start);
  }
}

/** Auto EPG Mapping — backfill LIVE streams missing a working epgChannelId. */
export async function jobEpgAutoMap() {
  const start = Date.now();
  try {
    const { autoAssignMissingEpg } = await import("./epg-auto-match");
    const result = await autoAssignMissingEpg({ limit: 300 });
    await logCron(
      "epg_auto_map",
      "ok",
      `scanned ${result.scanned}, assigned ${result.assigned}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("epg_auto_map", "error", String(e), Date.now() - start);
  }
}

/** XUI-style: rename LIVE streams from current EPG programme when enabled per stream. */
async function jobStreamEpgNameSync() {
  const start = Date.now();
  try {
    const { syncStreamNamesFromEpg } = await import("./stream-epg-name-sync");
    const updated = await syncStreamNamesFromEpg(50);
    if (updated) {
      await logCron("stream_epg_name_sync", "ok", `updated ${updated}`, Date.now() - start);
    }
  } catch (e) {
    await logCron("stream_epg_name_sync", "error", String(e), Date.now() - start);
  }
}

/** Fill missing live/VOD icons from IPTV provider catalogs, then TMDB. */
export async function jobVodEnrich() {
  const start = Date.now();
  try {
    const tmdbSettings = await getSettingGroup("tmdb");
    const types: Array<"MOVIE" | "SERIES" | "LIVE"> = ["LIVE"];
    if (tmdbSettings.enableMovieMeta !== false) types.push("MOVIE");
    if (tmdbSettings.enableSeriesMeta !== false) types.push("SERIES");

    const { fillMissingStreamArtwork } = await import("./artwork-fill");
    const { rewriteStoredVodMetaForXtream, fillMissingVodInfoFromTmdb } = await import("./vod-meta-rewrite");
    const rewritten = await rewriteStoredVodMetaForXtream();
    const { StreamType } = await import("@prisma/client");
    const result = await fillMissingStreamArtwork({
      types: types.map((t) => StreamType[t]),
      tmdbLimit: 400,
      liveLogoLimit: 30,
    });
      const infoFilled = types.includes("MOVIE") || types.includes("SERIES")
      ? await fillMissingVodInfoFromTmdb(400)
      : 0;
    let tmdbLib = { movies: 0, series: 0, missed: 0 };
    if (types.includes("MOVIE") || types.includes("SERIES")) {
      const { backfillTmdbVodBatch } = await import("./vod-tmdb-backfill");
      tmdbLib = await backfillTmdbVodBatch({ movieLimit: 25, seriesLimit: 25 });
    }
    await logCron(
      "vod_enrich",
      "ok",
      `updated ${result.updated} (iptv ${result.fromProvider}, tmdb ${result.fromTmdb}, meta ${rewritten + infoFilled}, lib ${tmdbLib.movies + tmdbLib.series}, remaining ${result.remaining})`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("vod_enrich", "error", String(e), Date.now() - start);
  }
}

export async function jobPanelBackup() {
  const start = Date.now();
  try {
    const { shouldRunScheduledBackup, markBackupLastRun } = await import("./backup-schedule");
    if (!(await shouldRunScheduledBackup())) {
      await logCron("panel_backup", "ok", "skipped (schedule)", Date.now() - start);
      return;
    }
    const result = await runPanelBackup();
    if (result.skipped) {
      await logCron("panel_backup", "ok", "disabled", Date.now() - start);
      return;
    }
    await markBackupLastRun();
    await logCron("panel_backup", "ok", result.path, Date.now() - start);
  } catch (e) {
    await logCron("panel_backup", "error", String(e), Date.now() - start);
  }
}

export async function jobServerRebalance() {
  const start = Date.now();
  try {
    const failover = await reassignStreamsFromOfflineServers();
    const settings = await getSettingGroup("streams");
    const mode = String(settings.autoRebalanceLive ?? "off");
    let spread = 0;
    if (mode === "even_spread") {
      const result = await rebalanceLiveStreamsAcrossServers({
        includeMain: settings.autoRebalanceIncludeMain === true,
      });
      spread = result.moved;
    }
    await logCron(
      "server_rebalance",
      "ok",
      `${failover} failover, ${spread} spread`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("server_rebalance", "error", String(e), Date.now() - start);
  }
}

export async function jobTheftDetection() {
  const start = Date.now();
  try {
    const { loadTheftSettings, runLineTheftJob, runVodTheftJob, runStreamTheftJob } =
      await import("@/lib/theft-detection-jobs");
    const settings = await loadTheftSettings();
    if (!settings.enabled) {
      await logCron("theft_detection", "ok", "disabled", Date.now() - start);
      return;
    }
    const line = await runLineTheftJob(settings);
    const vod = settings.vodTheftEnabled ? await runVodTheftJob(settings) : { alerts: 0, disabled: 0 };
    const stream = settings.streamTheftEnabled
      ? await runStreamTheftJob(settings)
      : { alerts: 0, disabled: 0 };
    await logCron(
      "theft_detection",
      "ok",
      `lines ${line.alerts}, vod ${vod.alerts}, streams ${stream.alerts}; disabled ${
        line.disabled + vod.disabled + stream.disabled
      }`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("theft_detection", "error", String(e), Date.now() - start);
  }
}

export async function jobCleanupActivityLogs() {
  const start = Date.now();
  try {
    const { purgeExpiredLogs } = await import("./log-maintenance");
    const r = await purgeExpiredLogs();
    const msg = r.skipped
      ? "auto-clear disabled"
      : `${r.activity} activity + ${r.cron} cron + ${r.leak} leak + ${r.imports} import rows removed (>${r.hours}h)`;
    await logCron("cleanup_activity", "ok", msg, Date.now() - start);
  } catch (e) {
    await logCron("cleanup_activity", "error", String(e), Date.now() - start);
  }
}

export async function jobExpireLines() {
  const start = Date.now();
  try {
    const expiring = await prisma.line.findMany({
      where: { expiresAt: { lt: new Date() }, status: "ACTIVE" },
      select: { id: true },
    });
    const r = await prisma.line.updateMany({
      where: { expiresAt: { lt: new Date() }, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    const { notifyLineSuspension } = await import("@/lib/panel-notification-events");
    for (const line of expiring) {
      await notifyLineSuspension(line.id, "Subscription expired");
    }
    await logCron("expire_lines", "ok", `${r.count} expired`, Date.now() - start);
  } catch (e) {
    await logCron("expire_lines", "error", String(e), Date.now() - start);
  }
}

async function jobPlaybackQuality() {
  const start = Date.now();
  try {
    const { runPlaybackQualityMonitor } = await import("./playback-quality-monitor");
    const r = await runPlaybackQualityMonitor();
    await logCron(
      "playback_quality",
      "ok",
      `watched ${r.watched}, drops ${r.drops}, freezes ${r.freezes}, stutters ${r.stutters}, failovers ${r.failovers}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("playback_quality", "error", String(e), Date.now() - start);
  }
}

export async function jobDeadLinkProbe() {
  const start = Date.now();
  try {
    const { runDeadLinkProbeJob } = await import("@/lib/panel-monitoring-jobs");
    const result = await runDeadLinkProbeJob();
    await logCron(
      "dead_link_probe",
      "ok",
      `probed ${result.probed}, failed ${result.failed}, restarted ${result.restarted}, logged ${result.logged}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("dead_link_probe", "error", String(e), Date.now() - start);
  }
}

export async function jobSubscriptionNotify() {
  const start = Date.now();
  try {
    const { runSubscriptionNotificationJob } = await import("@/lib/panel-notification-events");
    const result = await runSubscriptionNotificationJob();
    await logCron(
      "subscription_notify",
      "ok",
      `expiring ${result.expiring}, low credit ${result.lowCredit}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("subscription_notify", "error", String(e), Date.now() - start);
  }
}

export async function jobTelegramMonitoring() {
  const start = Date.now();
  try {
    const { runTelegramMonitoringJob } = await import("@/lib/panel-monitoring-jobs");
    const result = await runTelegramMonitoringJob();
    await logCron("telegram_monitoring", "ok", `${result.alerts} alerts`, Date.now() - start);
  } catch (e) {
    await logCron("telegram_monitoring", "error", String(e), Date.now() - start);
  }
}

export async function jobLicenseRevalidate() {
  const start = Date.now();
  try {
    const { heartbeatCheck } = await import("@/lib/license/server-guard");
    const result = await heartbeatCheck();
    await logCron(
      "license_revalidate",
      result.ok ? "ok" : "invalid",
      result.reason,
      Date.now() - start,
    );
    if (!result.ok) {
      console.error(`[LICENSE] Heartbeat failed: ${result.reason}`);
    }
  } catch (e) {
    await logCron("license_revalidate", "error", String(e), Date.now() - start);
  }
}

async function jobPanelHealthWatchdog() {
  const start = Date.now();
  try {
    const { maybeRestartUnhealthyPanel } = await import("./panel-health-watchdog");
    const result = await maybeRestartUnhealthyPanel();
    await logCron(
      "panel_health_watchdog",
      result.action === "restarting" ? "warn" : "ok",
      `${result.action}:${result.reason}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("panel_health_watchdog", "error", String(e), Date.now() - start);
  }
}

async function jobM3uSync() {
  const start = Date.now();
  try {
    const result = await runDueM3uSyncJobs(12);
    const msg =
      result.errors.length > 0
        ? `processed ${result.processed}, +${result.imported} new, ${result.errors.length} err`
        : `processed ${result.processed}, +${result.imported} new, ${result.skipped} skipped`;
    await logCron("m3u_sync", result.errors.length ? "warn" : "ok", msg, Date.now() - start);
  } catch (e) {
    await logCron("m3u_sync", "error", String(e), Date.now() - start);
  }
}

async function jobPlexAutoSync() {
  const start = Date.now();
  try {
    const cron = await getSettingGroup("cron");
    if (cron.plexSyncEnabled === false) {
      await logCron("plex_auto_sync", "ok", "disabled", Date.now() - start);
      return;
    }

    const { plexAutoSyncIsDue, plexScheduleHours } = await import("./plex-catalog-match");
    const intervalHours = plexScheduleHours(cron.plexSyncSchedule);
    const last = await prisma.panelSetting.findUnique({ where: { key: "plex_auto_sync_last_run" } });
    if (!plexAutoSyncIsDue(last?.value ?? null, intervalHours)) {
      await logCron("plex_auto_sync", "ok", `skipped (every ${intervalHours}h)`, Date.now() - start);
      return;
    }

    const rows = await prisma.mediaIntegration.findMany({
      where: { type: { in: ["plex", "emby", "jellyfin"] }, isActive: true },
      select: { id: true, type: true, config: true },
    });
    if (!rows.length) {
      await logCron("plex_auto_sync", "ok", "no hosted media integrations", Date.now() - start);
      return;
    }

    const { enqueuePlexSync } = await import("./plex-sync-queue");
    const { importEmbyLibrary, importJellyfinLibrary } = await import("./emby-jellyfin-import");
    const { createSyncReporter, isSyncJobActive, readSyncProgress } = await import("./integration-sync-progress");
    let queued = 0;
    let already = 0;
    let synced = 0;
    for (const row of rows) {
      if (row.type === "plex") {
        const result = await enqueuePlexSync(row.id);
        if (result.alreadyRunning) already++;
        else queued++;
        continue;
      }
      if (isSyncJobActive(readSyncProgress(row.config))) {
        already++;
        continue;
      }
      const reporter = createSyncReporter(row.id, `auto-${row.type}-${Date.now()}`);
      try {
        if (row.type === "emby") await importEmbyLibrary(row.id, null, reporter);
        else await importJellyfinLibrary(row.id, null, reporter);
        synced++;
      } catch (e) {
        await reporter.fail(e instanceof Error ? e.message : "Auto-sync failed");
      }
    }
    await logCron(
      "plex_auto_sync",
      "ok",
      `every ${intervalHours}h · plex queued ${queued} · hosted synced ${synced} · busy ${already}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("plex_auto_sync", "error", String(e), Date.now() - start);
  }
}

async function jobBackfillXtreamNum() {
  const start = Date.now();
  try {
    const { cuidToNum } = await import("./xtream-stream-id");
    const rows = await prisma.stream.findMany({
      where: { xtreamNum: null },
      select: { id: true },
      take: 2000,
    });
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 80) {
      const chunk = rows.slice(i, i + 80);
      await prisma.$transaction(
        chunk.map((row) =>
          prisma.stream.update({
            where: { id: row.id },
            data: { xtreamNum: cuidToNum(row.id) },
          })
        )
      );
    }
    await logCron("xtream_num_backfill", "ok", `updated ${rows.length}`, Date.now() - start);
  } catch (e) {
    await logCron("xtream_num_backfill", "error", String(e), Date.now() - start);
  }
}

async function jobPlexVodMetaBackfill() {
  const start = Date.now();
  try {
    const { backfillPlexVodMeta } = await import("./plex-vod-meta-backfill");
    const updated = await backfillPlexVodMeta(25);
    if (updated) await logCron("plex_vod_meta", "ok", `updated ${updated}`, Date.now() - start);
  } catch (e) {
    await logCron("plex_vod_meta", "error", String(e), Date.now() - start);
  }
}

async function jobWarmXtreamCatalogs() {
  const start = Date.now();
  try {
    const lines = await prisma.line.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { bouquets: { include: { bouquet: true } } },
      take: 80,
    });
    if (!lines.length) return;
    const { lineBouquetCacheToken } = await import("./lines");
    const { warmXtreamCatalogsNow } = await import("./xtream-catalog-blob");
    const { excludeDisabledFromExport } = await import("./export-policy");
    const excludeDisabled = await excludeDisabledFromExport();
    const seen = new Set<string>();
    for (const line of lines) {
      const token = lineBouquetCacheToken(line, excludeDisabled);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      await warmXtreamCatalogsNow(line);
      if (seen.size >= 16) break;
    }
    await logCron("xtream_catalog_warm", "ok", `tokens ${seen.size}`, Date.now() - start);
  } catch (e) {
    await logCron("xtream_catalog_warm", "error", String(e), Date.now() - start);
  }
}

export async function jobServerHostMetrics() {
  const start = Date.now();
  try {
    const { syncAllServerHostMetrics } = await import("./server-host-metrics-sync");
    const result = await syncAllServerHostMetrics();
    await logCron(
      "server_host_metrics",
      "ok",
      `${result.synced}/${result.total} servers`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("server_host_metrics", "error", String(e), Date.now() - start);
  }
}

async function jobProviderHealthCheck() {
  const start = Date.now();
  try {
    const providers = await prisma.streamProvider.findMany({
      where: { isActive: true },
      select: {
        id: true,
        baseUrl: true,
        apiKey: true,
        remoteUsername: true,
        remotePassword: true,
        lastCheckAt: true,
      },
      take: 20,
      orderBy: [{ lastCheckAt: "asc" }, { name: "asc" }],
    });
    if (!providers.length) {
      await logCron("provider_health", "ok", "no providers", Date.now() - start);
      return;
    }
    const { probeStreamProvider } = await import("./stream-provider-probe");
    let updated = 0;
    for (const p of providers) {
      const probe = await probeStreamProvider(p.baseUrl, {
        apiKey: p.apiKey,
        remoteUsername: p.remoteUsername,
        remotePassword: p.remotePassword,
      });
      await prisma.streamProvider.update({
        where: { id: p.id },
        data: {
          status: probe.status,
          statusMessage: probe.message,
          lastCheckAt: new Date(),
          lastLatencyMs: probe.latencyMs ?? null,
        },
      });
      updated++;
    }
    await logCron("provider_health", "ok", `checked ${updated}`, Date.now() - start);
  } catch (e) {
    await logCron("provider_health", "error", String(e), Date.now() - start);
  }
}

async function jobProviderXtreamSync() {
  const start = Date.now();
  try {
    const { runDueProviderXtreamSync } = await import("./provider-xtream-sync");
    const result = await runDueProviderXtreamSync(2);
    await logCron(
      "provider_xtream_sync",
      result.errors.length ? "warn" : "ok",
      `providers ${result.processed}, +${result.imported} ~${result.updated}${result.errors.length ? `, err ${result.errors.length}` : ""}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("provider_xtream_sync", "error", String(e), Date.now() - start);
  }
}

export async function runAllCronJobs() {
  await jobPanelHealthWatchdog();
  await jobCleanupConnections();
  await jobStopIdleStreams();
  await jobBandwidthSnapshot();
  await jobServerHostMetrics();
  await jobWatchFolders();
  await jobImportQueue();
  await jobM3uSync();
  await jobProviderXtreamSync();
  await jobProviderHealthCheck();
  await jobAgentAutoRestart();
  await jobServerRebalance();
  await jobTheftDetection();
  await jobCleanupActivityLogs();
  await jobExpireLines();
  await jobLicenseRevalidate();
  await jobDeadLinkProbe();
  await jobPlaybackQuality();
  await jobSubscriptionNotify();
  await jobTelegramMonitoring();
  await jobBackfillXtreamNum();
  await jobPlexVodMetaBackfill();
  await jobWarmXtreamCatalogs();
  await jobStreamEpgNameSync();
}

export async function jobAgentTokenRotation() {
  const days = Number(process.env.AGENT_TOKEN_ROTATE_DAYS ?? "0");
  if (!days || days < 7) {
    await logCron("agent_token_rotate", "ok", "disabled", 0);
    return;
  }
  const start = Date.now();
  try {
    const cutoff = new Date(Date.now() - days * 86400_000);
    const servers = await prisma.streamServer.findMany({
      where: { agentToken: { not: null }, agentLastSeen: { lt: cutoff } },
      select: { id: true },
    });
    for (const s of servers) {
      await prisma.streamServer.update({
        where: { id: s.id },
        data: { agentToken: generateAgentToken() },
      });
    }
    await logCron(
      "agent_token_rotate",
      "ok",
      `rotated ${servers.length} (inactive ${days}d+)`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("agent_token_rotate", "error", String(e), Date.now() - start);
  }
}

async function jobPanelAutoUpdate() {
  const start = Date.now();
  try {
    const { maybeAutoApplyPanelUpdate } = await import("./panel-update-auto");
    const result = await maybeAutoApplyPanelUpdate();
    await logCron(
      "panel_auto_update",
      "ok",
      result.started ? "started" : result.reason,
      Date.now() - start
    );
  } catch (e) {
    await logCron("panel_auto_update", "error", String(e), Date.now() - start);
  }
}

async function jobDbBackup() {
  const start = Date.now();
  try {
    const { shouldRunScheduledDbBackup, markDbBackupLastRun } = await import("./backup-schedule");
    if (!(await shouldRunScheduledDbBackup())) {
      await logCron("db_backup", "ok", "skipped (schedule)", Date.now() - start);
      return;
    }

    const backup = await getSettingGroup("backup");
    const { runPgDumpToGzip } = await import("@/lib/pg-dump");
    const { outPath, bytes } = await runPgDumpToGzip();

    const keepDays = Number(backup.pgDumpKeepDays ?? 14);
    try {
      const path = await import("path");
      const { readdirSync, statSync, unlinkSync } = await import("fs");
      const dir = path.dirname(outPath);
      const files = readdirSync(dir).filter((f) => f.startsWith("nexlify-pg-") && f.endsWith(".sql.gz"));
      const cutoff = Date.now() - keepDays * 86400000;
      for (const f of files) {
        const st = statSync(path.join(dir, f));
        if (st.mtimeMs < cutoff) {
          unlinkSync(path.join(dir, f));
        }
      }
    } catch {
      /* best effort cleanup */
    }

    await markDbBackupLastRun();
    await logCron("db_backup", "ok", `wrote ${outPath} (${bytes} bytes)`, Date.now() - start);
  } catch (e) {
    await logCron("db_backup", "error", String(e), Date.now() - start);
  }
}

async function jobCloudBackup() {
  const start = Date.now();
  try {
    const cloudSettings = await getSettingGroup("cloud-backup");
    if (!cloudSettings.cloudBackupEnabled) {
      await logCron("cloud_backup", "ok", "disabled", Date.now() - start);
      return;
    }
    const { runCloudBackup, cleanupExpiredBackups } = await import("./cloud-backup");
    await runCloudBackup();
    const cleaned = await cleanupExpiredBackups();
    await logCron("cloud_backup", "ok", `cleaned ${cleaned} expired`, Date.now() - start);
  } catch (e) {
    await logCron("cloud_backup", "error", String(e), Date.now() - start);
  }
}

export async function runHourlyCronJobs() {
  await jobEpgSync();
  await jobEpgAutoMap();
  await jobStreamEpgNameSync();
  await jobVodEnrich();
  await jobPanelBackup();
  await jobAgentTokenRotation();
  await jobPanelAutoUpdate();
  await jobDbBackup();
  await jobCloudBackup();
  await jobCheckStreamCerts();
  await jobPlexAutoSync();
}
