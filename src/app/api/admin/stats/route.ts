import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listActiveConnections } from "@/lib/connections";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";
import { formatAuditAction } from "@/lib/audit-log";
import { activityFixHref, cronFixHref } from "@/lib/activity-fix-links";
import { getDashboardServerMetrics, getDashboardSummary, getDashboardKpiExtended } from "@/lib/dashboard-server-metrics";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

async function loadStats() {
  const now = new Date();

  let connections: Awaited<ReturnType<typeof listActiveConnections>> = [];
  let snapshots: { bytesIn: bigint; bytesOut: bigint }[] = [];
  let totalIn: { value: string } | null = null;
  let totalOut: { value: string } | null = null;
  let lines = 0, activeLines = 0, liveStreams = 0, magDevices = 0;
  let logs: Awaited<ReturnType<typeof prisma.activityLog.findMany>> = [];
  let cronLast: { value: string } | null = null;

  try {
    const results = await Promise.all([
      prisma.line.count(),
      prisma.line.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
      prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
      prisma.magDevice.count({ where: { isActive: true } }),
      listActiveConnections(),
      prisma.activityLog.findMany({ take: 8, orderBy: { createdAt: "desc" }, where: { createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } } }),
      prisma.panelSetting.findUnique({ where: { key: "cron_last_run" } }),
      prisma.bandwidthSnapshot.findMany({ take: 2, orderBy: { createdAt: "desc" } }),
      prisma.panelSetting.findUnique({ where: { key: "network_bytes_in_total" } }),
      prisma.panelSetting.findUnique({ where: { key: "network_bytes_out_total" } }),
    ]);
    lines = results[0];
    activeLines = results[1];
    liveStreams = results[2];
    magDevices = results[3];
    connections = results[4];
    logs = results[5];
    cronLast = results[6];
    snapshots = results[7];
    totalIn = results[8];
    totalOut = results[9];
  } catch (e) {
    console.error("[stats] loadStats primary query error:", e);
  }

  const onlineConnections = connections.length;

  let networkInPerMin = 0;
  let networkOutPerMin = 0;
  if (snapshots.length >= 1) {
    const latest = snapshots[0];
    networkInPerMin = Number(latest.bytesIn);
    networkOutPerMin = Number(latest.bytesOut);
  }

  let cronLogs: { job: string; status: string; createdAt: Date; fixHref: string }[] = [];
  try {
    cronLogs = (await prisma.cronRunLog.findMany({ take: 5, orderBy: { createdAt: "desc" } })).map((log) => ({
      job: log.job,
      status: log.status,
      createdAt: log.createdAt,
      fixHref: cronFixHref(log.job, log.status),
    }));
  } catch {}

  let dashboard = { onlineStreams: 0, totalLiveStreams: 0, onlineUsers: 0, totalActiveLines: 0, onlineConnections: 0, maxConnections: 0, onlineServers: 0, totalServers: 0 };
  try { dashboard = await getDashboardSummary(); } catch (e) { console.error("[stats] getDashboardSummary error:", e); }

  let dashboardKpi = { paidUsers: 0, trialUsers: 0, unstableStreams: 0, deadStreams: 0, reportedChannels: 0, channelRequests: 0, networkInMbps: 0, networkOutMbps: 0 };
  try { dashboardKpi = await getDashboardKpiExtended(); } catch (e) { console.error("[stats] getDashboardKpiExtended error:", e); }

  let serverMetrics: Awaited<ReturnType<typeof getDashboardServerMetrics>> = [];
  try { serverMetrics = await getDashboardServerMetrics(); } catch (e) { console.error("[stats] getDashboardServerMetrics error:", e); }

  return {
    lines,
    activeLines,
    liveStreams,
    onlineConnections,
    magDevices,
    networkInPerMin,
    networkOutPerMin,
    networkBytesInTotal: totalIn?.value ?? "0",
    networkBytesOutTotal: totalOut?.value ?? "0",
    cronLastRun: cronLast?.value ?? null,
    cronLogs,
    logs: logs.map((log) => ({
      action: log.action,
      label: formatAuditAction(log.action),
      createdAt: log.createdAt,
      entity: log.entity,
      entityId: log.entityId,
      fixHref: activityFixHref(log),
    })),
    bouquets: await prisma.bouquet.count().catch(() => 0),
    resellers: await prisma.panelUser.count({ where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } } }).catch(() => 0),
    dashboard,
    dashboardKpi,
    serverMetrics,
  };
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ttl = await getCacheTtls();
  const stats = await cacheGetOrSet("stats:dashboard", ttl.stats, loadStats);
  return NextResponse.json(stats);
}
