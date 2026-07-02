import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChat, isAiConfigured } from "@/lib/ai";
import { PanelRole } from "@prisma/client";

function parseUserAgent(ua: string | null): string {
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("smart") || lower.includes("tv") || lower.includes("tizen") || lower.includes("webos"))
    return "smart_tv";
  if (lower.includes("android") && (lower.includes("mobile") || lower.includes("phone")))
    return "android_mobile";
  if (lower.includes("android")) return "android_tv";
  if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ios")) return "ios";
  if (lower.includes("windows")) return "windows";
  if (lower.includes("mac")) return "mac";
  if (lower.includes("linux")) return "linux";
  if (lower.includes("chromecast")) return "chromecast";
  if (lower.includes("fire") || lower.includes("aft")) return "fire_tv";
  return "other";
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel." },
      { status: 503 }
    );
  }

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [connections, geography, expiringLines, activeConnections] = await Promise.all([
      prisma.liveConnection.findMany({
        where: { startedAt: { gte: since7d } },
        select: {
          startedAt: true,
          userAgent: true,
          lineId: true,
          lastSeenAt: true,
          ip: true,
        },
      }),
      prisma.connectionGeography.groupBy({
        by: ["country", "countryCode"],
        where: { lastSeenAt: { gte: since24h } },
        _sum: { connectionCount: true, bandwidthBytes: true },
        orderBy: { _sum: { connectionCount: "desc" } },
        take: 20,
      }),
      prisma.line.findMany({
        where: {
          expiresAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
          status: "ACTIVE",
        },
        select: {
          id: true,
          username: true,
          expiresAt: true,
          lastWatchedAt: true,
          liveConnections: {
            orderBy: { lastSeenAt: "desc" },
            take: 1,
            select: { lastSeenAt: true },
          },
        },
      }),
      prisma.liveConnection.findMany({
        where: { lastSeenAt: { gte: since24h } },
        select: { lineId: true, startedAt: true, lastSeenAt: true, userAgent: true },
      }),
    ]);

    const hourCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    for (const c of connections) {
      const hour = c.startedAt.getHours();
      hourCounts[hour]++;
    }
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour: Number(hour), connections: count }));

    const deviceDistribution: Record<string, number> = {};
    for (const c of activeConnections) {
      const device = parseUserAgent(c.userAgent);
      deviceDistribution[device] = (deviceDistribution[device] || 0) + 1;
    }

    const churnRisk = expiringLines
      .filter((l) => !l.liveConnections.length || !l.lastWatchedAt || l.lastWatchedAt < since7d)
      .map((l) => ({
        lineId: l.id,
        username: l.username,
        expiresAt: l.expiresAt.toISOString(),
        lastActivity: l.lastWatchedAt?.toISOString() ?? null,
        hasRecentActivity: Boolean(
          l.liveConnections.length && l.liveConnections[0].lastSeenAt >= since7d
        ),
      }));

    const lineSessions: Record<string, { startedAt: Date; lastSeenAt: Date }[]> = {};
    for (const c of activeConnections) {
      if (!lineSessions[c.lineId]) lineSessions[c.lineId] = [];
      lineSessions[c.lineId].push({ startedAt: c.startedAt, lastSeenAt: c.lastSeenAt });
    }
    const bingePatterns = Object.entries(lineSessions)
      .map(([lineId, sessions]) => {
        sessions.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
        let maxContinuousMs = 0;
        for (let i = 0; i < sessions.length; i++) {
          let end = sessions[i].lastSeenAt.getTime();
          for (let j = i + 1; j < sessions.length; j++) {
            const gap = sessions[j].startedAt.getTime() - end;
            if (gap <= 5 * 60 * 1000) {
              end = Math.max(end, sessions[j].lastSeenAt.getTime());
            } else break;
          }
          maxContinuousMs = Math.max(maxContinuousMs, end - sessions[i].startedAt.getTime());
        }
        return { lineId, hours: maxContinuousMs / (1000 * 60 * 60), sessionCount: sessions.length };
      })
      .filter((p) => p.hours >= 4);

    let aiSummary = "";
    try {
      aiSummary = await aiChat(
        [
          {
            role: "system",
            content:
              "You are an IPTV analytics expert. Provide a concise summary (2-4 sentences) of the viewer analytics data. Highlight key insights about peak hours, geography, device usage, churn risk, and binge patterns.",
          },
          {
            role: "user",
            content: JSON.stringify({
              peakHours,
              topCountries: geography.slice(0, 5).map((g) => ({
                country: g.country,
                connections: g._sum.connectionCount,
              })),
              deviceDistribution,
              churnRiskCount: churnRisk.length,
              bingePatternCount: bingePatterns.length,
            }),
          },
        ],
        { maxTokens: 512 }
      );
    } catch {
      aiSummary = "AI summary unavailable.";
    }

    return NextResponse.json({
      peakHours,
      topCountries: geography.map((g) => ({
        country: g.country,
        countryCode: g.countryCode,
        connections: g._sum.connectionCount,
        bandwidthBytes: Number(g._sum.bandwidthBytes),
      })),
      deviceDistribution,
      churnRisk,
      bingePatterns,
      aiSummary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Viewer analytics error:", message);
    return NextResponse.json({ error: "Failed to load viewer analytics" }, { status: 500 });
  }
}
