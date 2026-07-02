import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChatJSON } from "@/lib/ai";
import { PanelRole } from "@prisma/client";

interface BouquetRecommendation {
  name: string;
  streams: { streamId: string; streamName: string; reason: string }[];
  estimatedReach: string;
  reasoning: string;
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const description = String(body.description ?? "").trim();
    if (!description) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }
    const targetAudience = body.targetAudience ? String(body.targetAudience) : undefined;
    const maxChannels = body.maxChannels ? Math.min(Number(body.maxChannels), 200) : 50;

    const [streams, categories, existingBouquets] = await Promise.all([
      prisma.stream.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          category: { select: { id: true, name: true } },
          isAdult: true,
          isRadio: true,
        },
        orderBy: { name: "asc" },
        take: 500,
      }),
      prisma.category.findMany({
        select: { id: true, name: true, categoryType: true },
        orderBy: { name: "asc" },
      }),
      prisma.bouquet.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { streams: true, lines: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const streamSummary = streams.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      category: s.category?.name ?? "Uncategorized",
      isAdult: s.isAdult,
      isRadio: s.isRadio,
    }));

    let recommendation: BouquetRecommendation;
    try {
      recommendation = await aiChatJSON<BouquetRecommendation>(
        [
          {
            role: "system",
            content:
              "You are an IPTV bouquet composition expert. Given a user description, recommend the best streams for a bouquet. Return JSON only: { name: string, streams: [{ streamId, streamName, reason }], estimatedReach: string, reasoning: string }. Limit to maxChannels streams.",
          },
          {
            role: "user",
            content: JSON.stringify({
              description,
              targetAudience,
              maxChannels,
              availableStreams: streamSummary.slice(0, 300),
              categories: categories.map((c) => ({ name: c.name, type: c.categoryType })),
              existingBouquets: existingBouquets.map((b) => ({
                name: b.name,
                streamCount: b._count.streams,
                lineCount: b._count.lines,
              })),
            }),
          },
        ],
        { maxTokens: 4096 }
      );
    } catch {
      return NextResponse.json(
        { error: "AI failed to generate recommendation" },
        { status: 500 }
      );
    }

    const validStreamIds = new Set(streams.map((s) => s.id));
    recommendation.streams = recommendation.streams
      .filter((s) => validStreamIds.has(s.streamId))
      .slice(0, maxChannels);

    await prisma.aiInsight.create({
      data: {
        type: "bouquet_recommendation",
        severity: "info",
        title: `Bouquet recommendation: ${recommendation.name}`,
        description: recommendation.reasoning,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: recommendation as any,
        entityType: "bouquet",
      },
    });

    return NextResponse.json({ recommendation });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Bouquet builder error:", message);
    return NextResponse.json({ error: "Failed to generate bouquet recommendation" }, { status: 500 });
  }
}
