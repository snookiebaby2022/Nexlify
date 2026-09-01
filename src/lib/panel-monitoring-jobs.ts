import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { streamProbeErrorWithHint } from "@/lib/stream-probe-fix-hints";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { sendTelegramAlert } from "@/lib/panel-telegram-alerts";
import { enqueueAgentCommand } from "@/lib/stream-agent";
import { findSiblingLiveBackupUrl } from "@/lib/live-channel-backup";
import {
  markDeadLinkProbeRun,
  probeStreamWithScheduler,
  PROBE_SCHEDULER_BUDGET_MS,
  runProbeBatchWithinBudget,
  shouldRunDeadLinkProbe,
} from "@/lib/source-probe-scheduler";

export async function runDeadLinkProbeJob() {
  if (!(await shouldRunDeadLinkProbe())) return { probed: 0, failed: 0, restarted: 0, logged: 0, skipped: true };

  const settings = await getSettingGroup("streams");
  if (!settings.autoFixDeadLinks) return { probed: 0, failed: 0, restarted: 0, logged: 0, skipped: true };

  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    include: { provider: true, server: true },
    take: 40,
    orderBy: [{ lastProbeAt: "asc" }, { updatedAt: "asc" }],
  });

  let failed = 0;
  let restarted = 0;
  let logged = 0;
  let probed = 0;

  await runProbeBatchWithinBudget(streams, PROBE_SCHEDULER_BUDGET_MS, async (stream) => {
    const primaryUrl = resolveStreamPlaybackUrl(stream);
    const { probe, skipped } = await probeStreamWithScheduler({
      streamId: stream.id,
      url: primaryUrl,
      fast: true,
    });
    probed += 1;
    const ok = !skipped && (probe.status === "online" || probe.status === "degraded");

    if (!stream.backupUrl?.trim()) {
      const sibling = await findSiblingLiveBackupUrl(stream);
      if (sibling) {
        await prisma.stream.update({
          where: { id: stream.id },
          data: { backupUrl: sibling },
        });
        stream.backupUrl = sibling;
      }
    }

    if (!ok && stream.backupUrl?.trim()) {
      const backupUrl = stream.backupUrl.trim();
      const backupResult = await probeStreamWithScheduler({
        streamId: stream.id,
        url: backupUrl,
        fast: true,
      });
      const backupOk =
        !backupResult.skipped &&
        (backupResult.probe.status === "online" || backupResult.probe.status === "degraded");
      if (backupOk) {
        await prisma.stream.update({
          where: { id: stream.id },
          data: {
            lastProbeAt: new Date(),
            lastProbeOk: true,
            lastProbeError: "Using backup URL (primary failed)",
          },
        });
        return;
      }
    }

    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        lastProbeAt: new Date(),
        lastProbeOk: ok,
        lastProbeError: ok
          ? probe.status === "degraded"
            ? streamProbeErrorWithHint(probe.message ?? "Probe degraded")
            : null
          : streamProbeErrorWithHint(probe.message ?? "Probe failed"),
      },
    });

    if (!ok) {
      failed++;
      logged++;
      const { getStreamPlaybackPolicy, streamPlaysInstantThroughServers } = await import("@/lib/stream-playback-policy");
      const forPolicy = {
        vodMode: stream.vodMode,
        isOnDemand: stream.isOnDemand,
        isCreatedChannel: stream.isCreatedChannel,
        agentStartCmd: stream.agentStartCmd,
        autoRestart: stream.autoRestart,
        streamUrl: stream.streamUrl,
        hostedExternally: stream.hostedExternally,
      };
      const skipFfmpegRestart =
        streamPlaysInstantThroughServers(forPolicy) || getStreamPlaybackPolicy(forPolicy) !== "transcode";
      if (stream.autoRestart && stream.serverId && stream.server?.agentToken && !skipFfmpegRestart) {
        await enqueueAgentCommand(stream.serverId, "restart_stream", { streamId: stream.id });
        restarted++;
      }
      if (stream.serverId && stream.server?.agentToken) {
        await enqueueAgentCommand(stream.serverId, "probe_stream", {
          streamId: stream.id,
          url: primaryUrl,
        }).catch(() => undefined);
      }
    }
  });

  await markDeadLinkProbeRun();
  return { probed, failed, restarted, logged, skipped: false };
}

export async function runTelegramMonitoringJob() {
  const settings = await getSettingGroup("monitoring");
  if (!settings.telegramAlertsEnabled) return { alerts: 0 };

  let alerts = 0;
  const offlineMinutes = Number(settings.offlineStreamMinutes ?? 5);
  const offlineCutoff = new Date(Date.now() - offlineMinutes * 60_000);

  const offlineServers = await prisma.streamServer.findMany({
    where: {
      isActive: true,
      agentToken: { not: null },
      OR: [{ agentLastSeen: { lt: offlineCutoff } }, { healthStatus: "offline" }],
    },
    take: 10,
  });

  if (settings.alertOfflineStreams && offlineServers.length) {
    const msg = `Nexlify alert: ${offlineServers.length} streaming server(s) offline or stale.`;
    const r = await sendTelegramAlert(msg);
    if (r.ok) alerts++;
  }

  const connThreshold = Number(settings.highLoadConnectionsThreshold ?? 500);
  const connCount = await prisma.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
  });
  if (settings.alertHighLoad && connCount >= connThreshold) {
    const r = await sendTelegramAlert(
      `Nexlify alert: high load - ${connCount} active connections (threshold ${connThreshold}).`
    );
    if (r.ok) alerts++;
  }

  const deadStreams = await prisma.stream.count({
    where: { isActive: true, lastProbeOk: false, lastProbeAt: { gte: offlineCutoff } },
  });
  if (settings.alertAbuse && deadStreams >= 5) {
    const r = await sendTelegramAlert(`Nexlify alert: ${deadStreams} streams failed health probe.`);
    if (r.ok) alerts++;
  }

  return { alerts };
}
