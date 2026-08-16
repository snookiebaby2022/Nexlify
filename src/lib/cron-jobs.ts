import { prisma } from "./prisma";
import { countActiveConnections, deleteStaleConnections } from "./connections";
import { importFromFolder } from "./import-media";
import { syncEpgSource } from "./epg";
import { enqueueAgentCommand, generateAgentToken } from "./stream-agent";
import { runPanelBackup } from "./backup-run";
import { getSettingGroup } from "./panel-settings";
import { reassignStreamsFromOfflineServers } from "./server-load";
import { jobCheckStreamCerts } from "./cert-monitor";
import { isRemoteM3uUrl } from "./m3u-watch-sync";
import { runDueM3uSyncJobs, runWatchFolderM3uSync } from "./m3u-sync-jobs";
import { snapshotNicTrafficForCron } from "./host-metrics";

async function logCron(job: string, status: string, message?: string, durationMs?: number) {
  // Persist errors/warnings always; skip trivial idle "ok" noise to keep CronRunLog small.
  const trivialOk =
    status === "ok" &&
    (!message ||
      /^(idle|0 |disabled|skipped)/i.test(message) ||
      message === "disabled" ||
      /^synced 0/.test(message) ||
      /^processed 0/.test(message) ||
      /^queued 0/.test(message) ||
      /^probed 0/.test(message) ||
      /^0 alerts/.test(message) ||
      /^0 expired/.test(message) ||
      /^0 streams/.test(message) ||
      /^0 removed/.test(message) ||
      /^stopped 0/.test(message) ||
      /^rotated 0/.test(message) ||
      message.includes("skipped (schedule)"));
  if (!trivialOk || status !== "ok") {
    await prisma.cronRunLog.create({
      data: { job, status, message, durationMs },
    });
  }
}

/** Avoid running heavy notify/probe jobs every single minute. */
async function dueEvery(key: string, intervalMs: number): Promise<boolean> {
  const settingKey = `cron_due_${key}`;
  const row = await prisma.panelSetting.findUnique({ where: { key: settingKey } });
  const last = row?.value ? Date.parse(row.value) : 0;
  if (Number.isFinite(last) && Date.now() - last < intervalMs) return false;
  await prisma.panelSetting.upsert({
    where: { key: settingKey },
    update: { value: new Date().toISOString() },
    create: { key: settingKey, value: new Date().toISOString() },
  });
  return true;
}

export async function jobCleanupConnections() {
  const start = Date.now();
  try {
    const r = await deleteStaleConnections();
    await logCron("cleanup_connections", "ok", `removed ${r.count}`, Date.now() - start);
  } catch (e) {
    await logCron("cleanup_connections", "error", String(e), Date.now() - start);
  }
}

export async function jobStopIdleStreams() {
  const start = Date.now();
  try {
    // Find all running stream processes
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const runningProcesses = await prisma.streamProcess.findMany({
      where: {
        status: "running",
        lastSeenAt: { gte: staleBefore },
      },
      select: {
        id: true,
        streamId: true,
        serverId: true,
      },
    });

    let stopped = 0;
    for (const proc of runningProcesses) {
      // Check if this stream has any active connections
      const connectionCount = await prisma.liveConnection.count({
        where: {
          streamId: proc.streamId,
          lastSeenAt: { gte: staleBefore },
        },
      });

      // If no active connections, stop the stream
      if (connectionCount === 0) {
        await prisma.streamProcess.update({
          where: { id: proc.id },
          data: { status: "stopped" },
        });
        await enqueueAgentCommand(proc.serverId, "stop_stream", { streamId: proc.streamId });
        stopped++;
      }
    }

    await logCron("stop_idle_streams", "ok", `stopped ${stopped} idle streams`, Date.now() - start);
  } catch (e) {
    await logCron("stop_idle_streams", "error", String(e), Date.now() - start);
  }
}

export async function jobBandwidthSnapshot() {
  const start = Date.now();
  try {
    const count = await countActiveConnections();
    const nic = await snapshotNicTrafficForCron();
    const bytesOut = nic?.bytesOut ?? BigInt(0);
    const bytesIn = nic?.bytesIn ?? BigInt(0);

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

    await logCron("bandwidth_snapshot", "ok", `${count} conns nic=${nic ? "yes" : "init"}`, Date.now() - start);
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

      const streamType =
        folder.type === "SERIES"
          ? "SERIES"
          : folder.type === "MOVIE"
            ? "MOVIE"
            : folder.type === "LIVE"
              ? "LIVE"
              : isRemoteM3uUrl(folder.path)
                ? "MIXED"
                : "MIXED";

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
    // Heal legacy numeric / unknown statuses left by SQL migrate (e.g. status "3").
    const stuck = await prisma.importJob.updateMany({
      where: {
        status: { notIn: ["queued", "running", "done", "failed", "cancelled"] },
        completedAt: null,
      },
      data: {
        status: "failed",
        message: "Invalid legacy import status cleared by cron",
        completedAt: new Date(),
      },
    });

    const job = await prisma.importJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) {
      await logCron(
        "import_queue",
        "ok",
        stuck.count ? `idle (healed ${stuck.count})` : "idle",
        Date.now() - start
      );
      return;
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date() },
    });

    let mode: "MOVIE" | "SERIES" | "MIXED" | "LIVE" =
      job.streamType === "SERIES"
        ? "SERIES"
        : job.streamType === "MOVIE"
          ? "MOVIE"
          : job.streamType === "LIVE"
            ? "LIVE"
            : "MIXED";

    let watchFolder: { type: string; path: string } | null = null;
    if (job.watchFolderId) {
      watchFolder = await prisma.watchFolder.findUnique({
        where: { id: job.watchFolderId },
        select: { type: true, path: true },
      });
      if (watchFolder?.type === "MIXED" || watchFolder?.type === "M3U") mode = "MIXED";
      else if (watchFolder?.type === "SERIES") mode = "SERIES";
      else if (watchFolder?.type === "MOVIE") mode = "MOVIE";
      else if (watchFolder?.type === "LIVE") mode = "LIVE";
    }

    let result = { imported: 0, skipped: 0 };
    try {
      if (watchFolder && isRemoteM3uUrl(job.source)) {
        result = await runWatchFolderM3uSync({
          id: job.watchFolderId!,
          name: "",
          path: job.source,
          type: watchFolder.type === "M3U" ? "MIXED" : watchFolder.type,
          categoryId: job.categoryId,
          serverId: job.serverId,
        });
      } else if (mode === "LIVE" && isRemoteM3uUrl(job.source)) {
        result = await runWatchFolderM3uSync({
          id: job.watchFolderId ?? job.id,
          name: "",
          path: job.source,
          type: "LIVE",
          categoryId: job.categoryId,
          serverId: job.serverId,
        });
      } else {
        result = await importFromFolder(job.source, {
          mode: mode === "LIVE" ? "MIXED" : mode,
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
    const stale = await prisma.streamProcess.findMany({
      where: {
        lastSeenAt: { lt: staleBefore },
        status: { in: ["running", "unknown"] },
        autoRestart: true,
        streamId: { not: null },
      },
      include: {
        stream: { select: { autoRestart: true, serverId: true } },
        server: { select: { agentToken: true, id: true } },
      },
      take: 20,
    });

    let restarted = 0;
    for (const proc of stale) {
      if (!proc.stream?.autoRestart || !proc.server?.agentToken || !proc.streamId) continue;
      await enqueueAgentCommand(proc.serverId, "restart_stream", { streamId: proc.streamId });
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

    await logCron("agent_auto_restart", "ok", `${restarted} queued`, Date.now() - start);
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
    let failed = 0;
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
        failed++;
        const err = String(e);
        // Auto-disable sources that have never synced and keep failing (bad migrate URLs).
        const neverSynced = !s.lastSync;
        await prisma.epgSource.update({
          where: { id: s.id },
          data: {
            lastSyncError: err,
            ...(neverSynced ? { isActive: false } : {}),
          },
        });
      }
    }
    await logCron(
      "epg_sync",
      failed && !ok ? "warn" : "ok",
      `synced ${ok}, skipped ${skipped}, failed ${failed}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("epg_sync", "error", String(e), Date.now() - start);
  }
}

/** Built-in Auto EPG Mapping — backfill LIVE streams missing a working epg_id. */
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

export async function jobPanelBackup() {
  const start = Date.now();
  try {
    const { shouldRunScheduledBackup, markBackupLastRun } = await import("./backup-schedule");
    if (!(await shouldRunScheduledBackup())) {
      await logCron("panel_backup", "ok", "skipped (schedule)", Date.now() - start);
      return;
    }

    const backup = await getSettingGroup("backup");
    if (!backup.enabled) {
      await logCron("panel_backup", "ok", "disabled", Date.now() - start);
      return;
    }

    // Large catalogs: run detached so the hourly cron tick is not blocked for hours.
    const streamCount = await prisma.stream.count();
    if (backup.fullExportOnBackup !== false && streamCount >= 10_000) {
      const { startBackupBackgroundJob, reconcileBackupJob } = await import("./backup-job");
      const existing = await reconcileBackupJob();
      if (existing?.status === "running") {
        await logCron("panel_backup", "ok", "already running", Date.now() - start);
        return;
      }
      const format =
        backup.exportFormat === "zip" ? "zip" : backup.exportFormat === "gzip" ? "gzip" : "json";
      const started = await startBackupBackgroundJob({
        trigger: "cron",
        format,
        includePasswords: backup.includePasswords === true,
        target: backup.target === "remote" ? "remote" : "local",
      });
      if (!started.ok) {
        await logCron("panel_backup", "error", started.error, Date.now() - start);
        return;
      }
      await markBackupLastRun();
      await logCron(
        "panel_backup",
        "ok",
        `started background ${started.job.id} (${streamCount} streams)`,
        Date.now() - start
      );
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
    const { rebalanceLiveStreamsAcrossServers } = await import("./server-load");
    const even = await rebalanceLiveStreamsAcrossServers({ maxMoves: 80 });
    await logCron(
      "server_rebalance",
      "ok",
      `failover ${failover}; balanced ${even.moved} across ${even.servers} servers`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("server_rebalance", "error", String(e), Date.now() - start);
  }
}

export async function jobTheftDetection() {
  if (!(await dueEvery("theft_detection", 15 * 60_000))) return;
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
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const r = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    await logCron("cleanup_activity", "ok", `${r.count} removed`, Date.now() - start);
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

export async function jobDeadLinkProbe() {
  if (!(await dueEvery("dead_link_probe", 15 * 60_000))) return;
  const start = Date.now();
  try {
    const { runDeadLinkProbeJob } = await import("@/lib/panel-monitoring-jobs");
    const result = await runDeadLinkProbeJob();
    await logCron(
      "dead_link_probe",
      "ok",
      `probed ${result.probed}, failed ${result.failed}, restarted ${result.restarted}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("dead_link_probe", "error", String(e), Date.now() - start);
  }
}

export async function jobSubscriptionNotify() {
  // Expiry/low-credit checks are expensive after large imports — run every 30 min.
  if (!(await dueEvery("subscription_notify", 30 * 60_000))) return;
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
  if (!(await dueEvery("telegram_monitoring", 15 * 60_000))) return;
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
    const soft = Boolean(result.soft) || result.reason === "no_license" || result.reason?.startsWith("network_");
    const status = result.ok ? "ok" : soft ? "warn" : "invalid";
    await logCron(
      "license_revalidate",
      status,
      result.reason,
      Date.now() - start,
    );
    if (!result.ok && !soft) {
      console.error(`[LICENSE] Heartbeat failed: ${result.reason}`);
    } else if (!result.ok && result.reason !== "no_license") {
      console.warn(`[LICENSE] Heartbeat soft fail: ${result.reason}`);
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
    const result = await runDueM3uSyncJobs(5);
    const msg =
      result.errors.length > 0
        ? `processed ${result.processed}, +${result.imported} new, ${result.errors.length} err`
        : `processed ${result.processed}, +${result.imported} new, ${result.skipped} skipped`;
    await logCron("m3u_sync", result.errors.length ? "warn" : "ok", msg, Date.now() - start);
  } catch (e) {
    await logCron("m3u_sync", "error", String(e), Date.now() - start);
  }
}

export async function jobCleanupCronLogs() {
  const start = Date.now();
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await prisma.cronRunLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    let trimmed = 0;
    const total = await prisma.cronRunLog.count();
    if (total > 8000) {
      const excess = await prisma.cronRunLog.findMany({
        orderBy: { createdAt: "asc" },
        take: total - 5000,
        select: { id: true },
      });
      for (let i = 0; i < excess.length; i += 1000) {
        const chunk = excess.slice(i, i + 1000).map((x) => x.id);
        const del = await prisma.cronRunLog.deleteMany({ where: { id: { in: chunk } } });
        trimmed += del.count;
      }
    }
    const notifCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const n = await prisma.panelNotification.deleteMany({
      where: { createdAt: { lt: notifCutoff }, kind: "ALERT" },
    });
    await logCron(
      "cleanup_cron_logs",
      "ok",
      `logs ${r.count + trimmed}, alerts ${n.count}`,
      Date.now() - start
    );
  } catch (e) {
    await logCron("cleanup_cron_logs", "error", String(e), Date.now() - start);
  }
}

export async function runAllCronJobs() {
  await jobPanelHealthWatchdog();
  await jobCleanupConnections();
  await jobStopIdleStreams();
  await jobBandwidthSnapshot();
  await jobWatchFolders();
  await jobImportQueue();
  await jobM3uSync();
  await jobAgentAutoRestart();
  await jobServerRebalance();
  await jobTheftDetection();
  await jobCleanupActivityLogs();
  await jobExpireLines();
  await jobLicenseRevalidate();
  await jobDeadLinkProbe();
  await jobSubscriptionNotify();
  await jobTelegramMonitoring();
  await jobCleanupCronLogs();
  await prisma.panelSetting.upsert({
    where: { key: "cron_last_run" },
    update: { value: new Date().toISOString() },
    create: { key: "cron_last_run", value: new Date().toISOString() },
  });
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

async function jobPgDump() {
  const start = Date.now();
  try {
    const backup = await getSettingGroup("backup");
    const dumpOn =
      backup.pgDumpCronEnabled === true ||
      backup.pgDumpCronEnabled === "true" ||
      backup.pgDumpCronEnabled === 1 ||
      backup.pgDumpCronEnabled === "1";
    if (!dumpOn) {
      return;
    }

    const { cronMatchesThisHour } = await import("./backup-schedule");
    const expr = String(backup.pgDumpCronSchedule || "0 4 * * *").trim();
    if (!cronMatchesThisHour(expr)) {
      return;
    }

    const last = await prisma.panelSetting.findUnique({ where: { key: "pg_dump_last_run" } });
    if (last?.value) {
      const elapsed = Date.now() - new Date(last.value).getTime();
      const hourField = expr.split(/\s+/)[1] ?? "4";
      const minGapMs = hourField === "*" ? 50 * 60_000 : 23 * 60 * 60 * 1000;
      if (elapsed < minGapMs) return;
    }

    const { runPgDumpToGzip, cleanupOldPgDumps, sanitizePgDumpError } = await import("./pg-dump");
    let result: Awaited<ReturnType<typeof runPgDumpToGzip>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await runPgDumpToGzip({ timeoutMs: 2 * 60 * 60 * 1000 });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const msg = sanitizePgDumpError(e).toLowerCase();
        const transient =
          msg.includes("connection refused") ||
          msg.includes("could not connect") ||
          msg.includes("the database system is starting") ||
          msg.includes("the database system is shutting down") ||
          msg.includes("server closed the connection") ||
          msg.includes("timeout expired") ||
          msg.includes("pg_dump already running");
        if (!transient || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    if (!result) throw lastErr ?? new Error("pg_dump failed");
    cleanupOldPgDumps(result.dir, Number(backup.pgDumpKeepDays ?? 14));
    await prisma.panelSetting.upsert({
      where: { key: "pg_dump_last_run" },
      create: { key: "pg_dump_last_run", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    await logCron(
      "pg_dump",
      "ok",
      `wrote ${result.outPath} (${result.bytes} bytes via ${result.pgDumpPath})`,
      Date.now() - start
    );
  } catch (e) {
    const { sanitizePgDumpError } = await import("./pg-dump");
    await logCron("pg_dump", "error", sanitizePgDumpError(e), Date.now() - start);
  }
}

async function jobCloudBackup() {
  const start = Date.now();
  try {
    const { runCloudBackup, cleanupExpiredBackups } = await import("./cloud-backup");
    await runCloudBackup();
    const cleaned = await cleanupExpiredBackups();
    await logCron("cloud_backup", "ok", `cleaned ${cleaned} expired`, Date.now() - start);
  } catch (e) {
    await logCron("cloud_backup", "error", String(e), Date.now() - start);
  }
}

export async function runHourlyCronJobs() {
  try {
    const { ensureAddonSettingsHealed } = await import("./panel-settings");
    await ensureAddonSettingsHealed();
  } catch {
    /* non-fatal */
  }
  await jobEpgSync();
  await jobEpgAutoMap();
  await jobPanelBackup();
  await jobAgentTokenRotation();
  await jobPanelAutoUpdate();
  await jobPgDump();
  await jobCloudBackup();
  await jobCheckStreamCerts();
}
