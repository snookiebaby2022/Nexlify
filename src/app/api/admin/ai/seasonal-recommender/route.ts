import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

interface SeasonalRecommendation {
  title: string;
  description: string;
  suggestedStreams: string[];
  estimatedImpact: string;
  timeframe: string;
}

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [streams, recentConnections, packages, bouquets] = await Promise.all([
      prisma.stream.findMany({
        where: { type: "LIVE", isActive: true },
        select: { id: true, name: true, categoryId: true, category: { select: { name: true } } },
        take: 200,
      }),
      prisma.liveConnection.findMany({
        where: { startedAt: { gte: thirtyDaysAgo } },
        select: {
          streamId: true,
          stream: { select: { name: true } },
          startedAt: true,
          ip: true,
        },
        orderBy: { startedAt: "desc" },
        take: 1000,
      }),
      prisma.package.findMany({
        where: { isActive: true },
        select: { id: true, name: true, creditCost: true, days: true, bouquetIds: true },
      }),
      prisma.bouquet.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const streamViewCounts: Record<string, { name: string; count: number }> = {};
    for (const conn of recentConnections) {
      if (!conn.streamId) continue;
      if (!streamViewCounts[conn.streamId]) {
        streamViewCounts[conn.streamId] = { name: conn.stream?.name ?? "Unknown", count: 0 };
      }
      streamViewCounts[conn.streamId].count++;
    }

    const input = {
      currentDate: now.toISOString(),
      month: now.getMonth() + 1,
      streams: streams.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category?.name,
        viewCount30d: streamViewCounts[s.id]?.count ?? 0,
      })),
      packages: packages.map((p) => ({
        name: p.name,
        creditCost: p.creditCost,
        days: p.days,
        bouquetCount: p.bouquetIds.length,
      })),
      bouquets: bouquets.map((b) => ({ name: b.name })),
      totalConnections30d: recentConnections.length,
      uniqueIps30d: new Set(recentConnections.map((c) => c.ip).filter(Boolean)).size,
    };

    const result = await aiChatJSON<{ recommendations: SeasonalRecommendation[] }>(
      [
        {
          role: "system",
          content: `You are a content strategist for an IPTV service. Based on the current date, upcoming events, and viewer trends, generate seasonal content recommendations.

Consider:
- Current month and upcoming holidays/events (sports seasons, holidays, major events)
- Which streams are most/least viewed
- Package and bouquet structure
- Content gaps that could be filled

Return JSON: { recommendations: [{ title, description, suggestedStreams: string[], estimatedImpact, timeframe }] }
Provide 3-5 actionable recommendations.`,
        },
        {
          role: "user",
          content: `Generate seasonal recommendations based on this data:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      { maxTokens: 2048 }
    );

    const recommendations = result.recommendations ?? [];

    if (recommendations.length > 0) {
      await prisma.aiInsight.createMany({
        data: recommendations.map((r) => ({
          type: "seasonal_recommendation",
          severity: "info",
          title: r.title,
          description: r.description,
          data: {
            suggestedStreams: r.suggestedStreams,
            estimatedImpact: r.estimatedImpact,
            timeframe: r.timeframe,
          },
        })),
      });
    }

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("Seasonal recommender error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
