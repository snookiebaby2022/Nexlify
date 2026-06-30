import { prisma } from "@/lib/prisma";
import { isPluginEntitled } from "@/lib/plugin-entitlement";

export type AnalyticsInsight = {
  type: "churn_risk" | "peak_hours" | "top_content_region" | "stream_optimization" | "epg_gap";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  entityId?: string;
  metric?: number;
};

export async function isAnalyticsAiEnabled(panelHost?: string): Promise<boolean> {
  const entitled = await isPluginEntitled("analytics_ai", panelHost);
  if (!entitled.ok) return false;
  const { getSettingGroup } = await import("@/lib/panel-settings");
  const s = await getSettingGroup("analytics-ai" as never);
  return s.enabled === true;
}

export async function generateAnalyticsInsights(): Promise<AnalyticsInsight[]> {
  if (!(await isAnalyticsAiEnabled())) return [];

  const insights: AnalyticsInsight[] = [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const lines = await prisma.line.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date(now.getTime() + 7 * 86400000) } },
    select: { id: true, username: true, expiresAt: true, _count: { select: { liveConnections: true } } },
    take: 200,
  });

  for (const line of lines) {
    const daysLeft = (line.expiresAt.getTime() - now.getTime()) / 86400000;
    const inactive = line._count.liveConnections === 0;
    if (daysLeft <= 7 && inactive) {
      insights.push({
        type: "churn_risk",
        severity: daysLeft <= 2 ? "critical" : "warning",
        title: `Churn risk: ${line.username}`,
        detail: `Expires in ${Math.ceil(daysLeft)} days with no recent activity.`,
        entityId: line.id,
        metric: Math.max(0, 100 - daysLeft * 10),
      });
    }
  }

  const geo = await prisma.connectionGeography.groupBy({
    by: ["countryCode", "streamId"],
    _sum: { connectionCount: true, bandwidthBytes: true },
    where: { lastSeenAt: { gte: weekAgo } },
    orderBy: { _sum: { connectionCount: "desc" } },
    take: 10,
  });

  for (const row of geo) {
    if (!row.streamId) continue;
    const stream = await prisma.stream.findUnique({ where: { id: row.streamId }, select: { name: true } });
    insights.push({
      type: "top_content_region",
      severity: "info",
      title: `${stream?.name ?? row.streamId} popular in ${row.countryCode}`,
      detail: `${row._sum.connectionCount ?? 0} connections this week.`,
      entityId: row.streamId,
      metric: Number(row._sum.connectionCount ?? 0),
    });
  }

  const staleStreams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE", lastProbeOk: false },
    select: { id: true, name: true },
    take: 20,
  });
  for (const s of staleStreams) {
    insights.push({
      type: "stream_optimization",
      severity: "warning",
      title: `Stream down: ${s.name}`,
      detail: "Last probe failed — consider source swap or auto-fix.",
      entityId: s.id,
    });
  }

  const unmapped = await prisma.stream.count({
    where: { isActive: true, type: "LIVE", epgChannelId: null },
  });
  if (unmapped > 10) {
    insights.push({
      type: "epg_gap",
      severity: "info",
      title: `${unmapped} channels without EPG mapping`,
      detail: "Run Auto EPG Mapping or AI EPG match from EPG → Channels.",
      metric: unmapped,
    });
  }

  return insights.slice(0, 50);
}

export async function predictPeakConcurrency(): Promise<{ hourUtc: number; estimated: number }[]> {
  const buckets = new Array(24).fill(0);
  const since = new Date(Date.now() - 14 * 86400000);
  const rows = await prisma.liveConnection.findMany({
    where: { startedAt: { gte: since } },
    select: { startedAt: true },
    take: 5000,
  });
  for (const r of rows) {
    const h = r.startedAt.getUTCHours();
    buckets[h] += 1;
  }
  const max = Math.max(...buckets, 1);
  return buckets.map((c, hourUtc) => ({
    hourUtc,
    estimated: Math.round((c / max) * 100),
  }));
}
