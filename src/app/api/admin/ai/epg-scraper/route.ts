import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChatJSON } from "@/lib/ai";
import { PanelRole } from "@prisma/client";

interface EpgSuggestion {
  channelName: string;
  suggestedCategory: string;
  suggestedName: string;
  confidence: number;
}

interface AiResult {
  suggestions: EpgSuggestion[];
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [sources, channelsWithoutEpg, existingPrograms] = await Promise.all([
      prisma.epgSource.findMany({
        where: { isActive: true },
        select: { id: true, name: true, country: true },
      }),
      prisma.stream.findMany({
        where: {
          type: "LIVE",
          isActive: true,
          OR: [{ epgChannelId: null }, { epgChannelId: "" }],
        },
        select: { id: true, name: true, categoryId: true, category: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: 100,
      }),
      prisma.epgProgram.findMany({
        orderBy: { start: "desc" },
        take: 200,
        select: { channelId: true, title: true, source: { select: { name: true } } },
      }),
    ]);

    const epgPatterns = existingPrograms.reduce(
      (acc, p) => {
        if (!acc[p.channelId]) acc[p.channelId] = { titles: [], sources: new Set<string>() };
        acc[p.channelId].titles.push(p.title);
        acc[p.channelId].sources.add(p.source.name);
        return acc;
      },
      {} as Record<string, { titles: string[]; sources: Set<string> }>
    );

    const patternSummary = Object.entries(epgPatterns)
      .slice(0, 30)
      .map(([ch, data]) => ({
        channelId: ch,
        sampleTitles: data.titles.slice(0, 3),
        sources: [...data.sources],
      }));

    let result: AiResult = { suggestions: [] };
    try {
      result = await aiChatJSON<AiResult>(
        [
          {
            role: "system",
            content:
              "You are an EPG (Electronic Program Guide) analyst. Given channels without EPG data and existing EPG patterns, suggest category mappings and fill gaps. Return JSON only: { suggestions: [{ channelName, suggestedCategory, suggestedName, confidence }] }",
          },
          {
            role: "user",
            content: JSON.stringify({
              channelsWithoutEpg: channelsWithoutEpg.map((c) => ({
                name: c.name,
                currentCategory: c.category?.name ?? null,
              })),
              existingEpgPatterns: patternSummary,
              availableSources: sources.map((s) => ({ name: s.name, country: s.country })),
            }),
          },
        ],
        { maxTokens: 2048 }
      );
    } catch {
      result = { suggestions: [] };
    }

    const insights = result.suggestions.map((s) =>
      prisma.aiInsight.create({
        data: {
          type: "epg_suggestion",
          severity: s.confidence > 0.7 ? "info" : "warning",
          title: `EPG suggestion: ${s.channelName}`,
          description: `Suggested category: ${s.suggestedCategory}, name: ${s.suggestedName} (confidence: ${Math.round(s.confidence * 100)}%)`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: s as any,
          entityType: "stream",
        },
      })
    );

    if (insights.length > 0) {
      await prisma.$transaction(insights);
    }

    return NextResponse.json({
      suggestions: result.suggestions,
      summary: {
        channelsWithoutEpg: channelsWithoutEpg.length,
        suggestionsGenerated: result.suggestions.length,
        sourcesCount: sources.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("EPG scraper AI error:", message);
    return NextResponse.json({ error: "Failed to generate EPG suggestions", suggestions: [] }, { status: 500 });
  }
}
