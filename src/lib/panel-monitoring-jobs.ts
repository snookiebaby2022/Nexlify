import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { probeStreamUrl } from "@/lib/stream-probe-server";
import { streamProbeErrorWithHint } from "@/lib/stream-probe-fix-hints";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { sendTelegramAlert } from "@/lib/panel-telegram-alerts";
import { enqueueAgentCommand } from "@/lib/stream-agent";

export async function runDeadLinkProbeJob() {
  const settings = await getSettingGroup("streams");
  if (!settings.autoFixDeadLinks) return { probed: 0, failed: 0, restarted: 0, disabled: 0 };

  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    include: { provider: true, server: true },
    take: 40,
    orderBy: [{ lastProbeAt: "asc" }, { updatedAt: "asc" }],
  });

  let failed = 0;
  let restarted = 0;
  let disabled = 0;

  for (const stream of streams) {
    const primaryUrl = resolveStreamPlaybackUrl(stream);
    const probe = await probeStreamUrl(primaryUrl, { fast: true });
    const ok = probe.status === "online";
    const wasAlreadyFailing = stream.lastProbeOk === false;

    if (!ok && stream.backupUrl?.trim()) {
      const backupProbe = await probeStreamUrl(stream.backupUrl.trim(), { fast: true });
      if (backupProbe.status === "online") {
        await prisma.stream.update({
          where: { id: stream.id },
          data: {
            lastProbeAt: new Date(),
            lastProbeOk: true,
            lastProbeError: "Using backup URL (primary failed)",
          },
        });
        continue;
      }
    }

    if (!ok && wasAlreadyFailing) {
      // Second consecutive failure → auto-disable so playlists stop offering dead channels
      await prisma.stream.update({
        where: { id: stream.id },
        data: {
          isActive: false,
          lastProbeAt: new Date(),
          lastProbeOk: false,
          lastProbeError: streamProbeErrorWithHint(`Auto-disabled: ${probe.message ?? "dead link"}`),
        },
      });
      failed++;
      disabled++;
      continue;
    }

    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        lastProbeAt: new Date(),
        lastProbeOk: ok,
        lastProbeError: ok ? null : streamProbeErrorWithHint(probe.message ?? "Probe failed"),
      },
    });

    if (!ok) {
      failed++;
      if (stream.autoRestart && stream.serverId && stream.server?.agentToken) {
        await enqueueAgentCommand(stream.serverId, "restart_stream", { streamId: stream.id });
        restarted++;
      }
      // Prefer probe from the assigned stream server when an agent is present
      if (stream.serverId && stream.server?.agentToken) {
        await enqueueAgentCommand(stream.serverId, "probe_stream", {
          streamId: stream.id,
          url: primaryUrl,
        }).catch(() => undefined);
      }
    }
  }

  return { probed: streams.length, failed, restarted, disabled };
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
