import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChatJSON, isAiConfigured } from "@/lib/ai";
import { PanelRole, StreamHealthStatus } from "@prisma/client";

interface Prediction {
  streamId: string;
  streamName: string;
  riskPercent: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  recommendation: string;
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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const streams = await prisma.stream.findMany({
      where: { type: "LIVE", isActive: true },
      select: {
        id: true,
        name: true,
        lastProbeOk: true,
        backupUrl: true,
        healthChecks: {
          where: { checkedAt: { gte: since } },
          orderBy: { checkedAt: "desc" },
          select: { status: true, checkedAt: true, errorMessage: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const predictions: Prediction[] = [];

    for (const stream of streams) {
      const upCount = stream.healthChecks.filter((h) => h.status === StreamHealthStatus.UP).length;
      const downCount = stream.healthChecks.filter((h) => h.status === StreamHealthStatus.DOWN).length;
      const degradedCount = stream.healthChecks.filter(
        (h) => h.status === StreamHealthStatus.DEGRADED
      ).length;
      const totalChecks = stream.healthChecks.length;

      const probeHistory = { up: upCount, down: downCount, degraded: degradedCount, total: totalChecks };

      try {
        const result = await aiChatJSON<Prediction>(
          [
            {
              role: "system",
              content:
                "You are an IPTV stream health analyst. Given probe history data, predict the risk of a stream going down. Return JSON only: { riskPercent: number, riskLevel: 'low'|'medium'|'high'|'critical', reason: string, recommendation: string }",
            },
            {
              role: "user",
              content: JSON.stringify({
                streamName: stream.name,
                probeHistory,
                currentLastProbeOk: stream.lastProbeOk,
                backupUrlExists: Boolean(stream.backupUrl),
              }),
            },
          ],
          { maxTokens: 512 }
        );

        const severity =
          result.riskLevel === "critical"
            ? "critical"
            : result.riskLevel === "high"
              ? "warning"
              : "info";

        await prisma.aiInsight.create({
          data: {
            type: "health_prediction",
            severity,
            title: `Health prediction: ${stream.name}`,
            description: result.reason,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: result as any,
            entityType: "stream",
            entityId: stream.id,
          },
        });

        predictions.push({ ...result, streamId: stream.id, streamName: stream.name });
      } catch {
        predictions.push({
          streamId: stream.id,
          streamName: stream.name,
          riskPercent: 0,
          riskLevel: "low",
          reason: "Insufficient data for prediction",
          recommendation: "Continue monitoring",
        });
      }
    }

    const atRisk = predictions.filter((p) => p.riskLevel === "high" || p.riskLevel === "critical").length;

    return NextResponse.json({
      predictions,
      summary: { total: predictions.length, atRisk },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Health predictor error:", message);
    return NextResponse.json({ error: "Failed to generate health predictions", predictions: [], summary: { total: 0, atRisk: 0 } }, { status: 500 });
  }
}
