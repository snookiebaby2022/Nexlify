import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { probeStreamUrl, type ProbeResult } from "@/lib/stream-probe-server";
import { streamProbeErrorWithHint } from "@/lib/stream-probe-fix-hints";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { sendTelegramAlert } from "@/lib/panel-telegram-alerts";
import { enqueueAgentCommand } from "@/lib/stream-agent";
import { findSiblingLiveBackupUrl } from "@/lib/live-channel-backup";
import { allowSourceProbe, recordSourceProbe } from "@/lib/source-circuit-breaker";

export async function runDeadLinkProbeJob() {
  const settings = await getSettingGroup("streams");
  if (!settings.autoFixDeadLinks) return { probed: 0, failed: 0, restarted: 0, logged: 0 };

  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    include: { provider: true, server: true },
    take: 40,
    orderBy: [{ lastProbeAt: "asc" }, { updatedAt: "asc" }],
  });

  let failed = 0;
  let restarted = 0;
  let logged = 0;

  for (const stream of streams) {
    const primaryUrl = resolveStreamPlaybackUrl(stream);
    const primaryAllowed = await allowSourceProbe(stream.id, primaryUrl);
    const probe: ProbeResult = primaryAllowed
      ? await probeStreamUrl(primaryUrl, { fast: true })
      : { status: "offline" as const, message: "Circuit open — primary probe deferred" };
    const ok = probe.status === "online" || probe.status === "degraded";
    if (primaryAllowed) {
      await recordSourceProbe({
        streamId: stream.id,
        url: primaryUrl,
        ok,
        error: ok ? null : probe.message,
        latencyMs: probe.latencyMs,
        bitrateKbps: probe.bitrateKbps,
      });
    }

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
      const backupAllowed = await allowSourceProbe(stream.id, backupUrl);
      const backupProbe: ProbeResult = backupAllowed
        ? await probeStreamUrl(backupUrl, { fast: true })
        : { status: "offline", message: "Circuit open — backup probe deferred" };
      const backupOk = backupProbe.status === "online" || backupProbe.status === "degraded";
      if (backupAllowed) {
        await recordSourceProbe({
          streamId: stream.id,
          url: backupUrl,
          ok: backupOk,
          error: backupOk ? null : backupProbe.message,
          latencyMs: backupProbe.latencyMs,
          bitrateKbps: backupProbe.bitrateKbps,
        });
      }
      if (backupOk) {
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
      // Prefer probe from the assigned stream server when an agent is present
      if (stream.serverId && stream.server?.agentToken) {
        await enqueueAgentCommand(stream.serverId, "probe_stream", {
          streamId: stream.id,
          url: primaryUrl,
        }).catch(() => undefined);
      }
    }
  }

  return { probed: streams.length, failed, restarted, logged };
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
