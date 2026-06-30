import { prisma } from "./prisma";
import { listActiveConnections } from "./connections";
import { importFromFolder } from "./import-media";
import { syncEpgSource } from "./epg";
import { enqueueAgentCommand, generateAgentToken } from "./stream-agent";
import { runPanelBackup } from "./backup-run";
import { reassignStreamsFromOfflineServers } from "./server-load";

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
    await listActiveConnections();
    await logCron("cleanup_connections", "ok", undefined, Date.now() - start);
  } catch (e) {
    await logCron("cleanup_connections", "error", String(e), Date.now() - start);
  }
}

export async function jobBandwidthSnapshot() {
  const start = Date.now();
  try {
    const connections = await listActiveConnections();
    const count = connections.length;
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

      const streamType =
        folder.type === "SERIES" ? "SERIES" : folder.type === "MOVIE" ? "MOVIE" : "MOVIE";

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
    if (job.watchFolderId) {
      const wf = await prisma.watchFolder.findUnique({ where: { id: job.watchFolderId } });
      if (wf?.type === "MIXED") mode = "MIXED";
      else if (wf?.type === "SERIES") mode = "SERIES";
      else if (wf?.type === "MOVIE") mode = "MOVIE";
    }

    let result = { imported: 0, skipped: 0 };
    try {
      result = await importFromFolder(job.source, {
        mode,
        categoryId: job.categoryId,
        serverId: job.serverId,
        allowedRoot: process.env.MEDIA_IMPORT_ROOT,
      });
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
    const n = await reassignStreamsFromOfflineServers();
    await logCron("server_rebalance", "ok", `${n} streams moved`, Date.now() - start);
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
    const host = process.env.PANEL_PRIMARY_DOMAIN ?? "localhost";
    const { pollVendorLicenseSync } = await import("@/lib/license/remote-sync");
    await pollVendorLicenseSync(host);
    const { revalidateStoredLicense } = await import("@/lib/license");
    const ok = await revalidateStoredLicense(host);
    await logCron("license_revalidate", ok ? "ok" : "invalid", undefined, Date.now() - start);
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

export async function runAllCronJobs() {
  await jobPanelHealthWatchdog();
  await jobCleanupConnections();
  await jobBandwidthSnapshot();
  await jobWatchFolders();
  await jobImportQueue();
  await jobAgentAutoRestart();
  await jobServerRebalance();
  await jobTheftDetection();
  await jobCleanupActivityLogs();
  await jobExpireLines();
  await jobLicenseRevalidate();
  await jobDeadLinkProbe();
  await jobSubscriptionNotify();
  await jobTelegramMonitoring();
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

async function jobPanelHeartbeat() {
  const start = Date.now();
  try {
    const { sendPanelHeartbeat } = await import("./panel-vendor-sync");
    const result = await sendPanelHeartbeat();
    await logCron("panel_heartbeat", result.ok ? "ok" : "error", result.error, Date.now() - start);
  } catch (e) {
    await logCron("panel_heartbeat", "error", String(e), Date.now() - start);
  }
}

export async function runHourlyCronJobs() {
  await jobEpgSync();
  await jobPanelBackup();
  await jobAgentTokenRotation();
  await jobPanelAutoUpdate();
  await jobPanelHeartbeat();
}
