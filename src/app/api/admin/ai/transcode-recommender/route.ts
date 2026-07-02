import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

interface TranscodeSuggestion {
  streamId: string;
  reason: string;
  currentBitrate: number | null;
  suggestedBitrate: number;
  estimatedSavings: number;
  viewerImpact: string;
}

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const streams = await prisma.stream.findMany({
      where: { type: "LIVE", isActive: true },
      include: {
        healthChecks: { orderBy: { checkedAt: "desc" }, take: 10 },
        liveConnections: { where: { lastSeenAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } } },
      },
    });

    const streamData = streams.map((s) => ({
      id: s.id,
      name: s.name,
      lastProbeOk: s.lastProbeOk,
      viewerCount: s.liveConnections.length,
      recentHealth: s.healthChecks.map((h) => ({
        status: h.status,
        bitrateKbps: h.bitrateKbps,
        hasLoop: h.hasLoop,
        hasFreeze: h.hasFreeze,
        hasAudioLoss: h.hasAudioLoss,
        checkedAt: h.checkedAt,
      })),
    }));

    const result = await aiChatJSON<{ suggestions: TranscodeSuggestion[] }>(
      [
        {
          role: "system",
          content: `You are a streaming infrastructure analyst. Analyze live streams and recommend transcoding optimizations. Consider:
- Probe success/failure status
- Viewer count and bandwidth usage
- Health check patterns (loops, freezes, audio loss, bitrate fluctuations)
- Whether bitrate can be lowered without noticeable quality loss for low-viewer streams

Return JSON: { suggestions: [{ streamId, reason, currentBitrate, suggestedBitrate, estimatedSavings (percentage), viewerImpact }] }
Only include streams that would benefit from transcoding changes.`,
        },
        {
          role: "user",
          content: `Analyze these live streams and recommend transcoding:\n${JSON.stringify(streamData, null, 2)}`,
        },
      ],
      { maxTokens: 2048 }
    );

    const suggestions = result.suggestions ?? [];

    if (suggestions.length > 0) {
      await prisma.aiTranscodeSuggestion.createMany({
        data: suggestions.map((s) => ({
          streamId: s.streamId,
          reason: s.reason,
          currentBitrate: s.currentBitrate,
          suggestedBitrate: s.suggestedBitrate,
          estimatedSavings: s.estimatedSavings,
          viewerImpact: s.viewerImpact,
        })),
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Transcode recommender error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
