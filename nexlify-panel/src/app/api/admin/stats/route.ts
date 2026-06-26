import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listActiveConnections } from "@/lib/connections";
import { cacheGetOrSet } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";
import { formatAuditAction } from "@/lib/audit-log";
import { activityFixHref, cronFixHref } from "@/lib/activity-fix-links";
import { getDashboardServerMetrics, getDashboardSummary } from "@/lib/dashboard-server-metrics";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

async function loadStats() {
  const now = new Date();

  const [
    lines,
    activeLines,
    liveStreams,
    magDevices,
    connections,
    logs,
    cronLast,
    snapshots,
    totalIn,
    totalOut,
  ] = await Promise.all([
    prisma.line.count(),
    prisma.line.count({
      where: { status: "ACTIVE", expiresAt: { gt: now } },
    }),
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.magDevice.count({ where: { isActive: true } }),
    listActiveConnections(),
    prisma.activityLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      where: { createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    }),
    prisma.panelSetting.findUnique({ where: { key: "cron_last_run" } }),
    prisma.bandwidthSnapshot.findMany({
      take: 2,
      orderBy: { createdAt: "desc" },
    }),
    prisma.panelSetting.findUnique({ where: { key: "network_bytes_in_total" } }),
    prisma.panelSetting.findUnique({ where: { key: "network_bytes_out_total" } }),
  ]);

  const onlineConnections = connections.length;

  let networkInPerMin = 0;
  let networkOutPerMin = 0;
  if (snapshots.length >= 1) {
    const latest = snapshots[0];
    networkInPerMin = Number(latest.bytesIn);
    networkOutPerMin = Number(latest.bytesOut);
  }

  const cronLogs = await prisma.cronRunLog.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
  });

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
    cronLogs: cronLogs.map((log) => ({
      job: log.job,
      status: log.status,
      createdAt: log.createdAt,
      fixHref: cronFixHref(log.job, log.status),
    })),
    logs: logs.map((log) => ({
      action: log.action,
      label: formatAuditAction(log.action),
      createdAt: log.createdAt,
      entity: log.entity,
      entityId: log.entityId,
      fixHref: activityFixHref(log),
    })),
    bouquets: await prisma.bouquet.count(),
    resellers: await prisma.panelUser.count({
      where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } },
    }),
    dashboard: await getDashboardSummary(),
    serverMetrics: await getDashboardServerMetrics(),
  };
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const denied = await pluginEntitlementResponse("statistics", host);
  if (denied) return denied;

  const stats = await cacheGetOrSet("stats:dashboard", 15, loadStats);
  return NextResponse.json(stats);
}
