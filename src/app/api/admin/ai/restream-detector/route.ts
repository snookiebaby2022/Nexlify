import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

interface RestreamDetection {
  lineId: string;
  lineUsername: string;
  confidence: number;
  indicators: string[];
  riskScore: number;
}

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [connections, leakLogs, fingerprints, sameIp] = await Promise.all([
      prisma.liveConnection.findMany({
        where: { lastSeenAt: { gte: recentWindow } },
        include: {
          line: { select: { id: true, username: true, maxConnections: true, isRestreamer: true } },
          stream: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 500,
      }),
      prisma.leakAuditLog.findMany({
        where: { createdAt: { gte: recentWindow } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.streamFingerprint.findMany({
        where: { createdAt: { gte: recentWindow }, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.sameIpDetection.findMany({
        where: { detectedAt: { gte: recentWindow } },
        orderBy: { detectedAt: "desc" },
        take: 200,
      }),
    ]);

    const input = {
      connections: connections.map((c) => ({
        lineId: c.lineId,
        lineUsername: c.line?.username,
        maxConnections: c.line?.maxConnections,
        isRestreamer: c.line?.isRestreamer,
        streamName: c.stream?.name,
        ip: c.ip,
        userAgent: c.userAgent,
        startedAt: c.startedAt,
        lastSeenAt: c.lastSeenAt,
      })),
      leakLogs: leakLogs.map((l) => ({
        lineId: l.lineId,
        streamId: l.streamId,
        ip: l.ip,
        userAgent: l.userAgent,
        fingerprint: l.fingerprint,
        action: l.action,
        createdAt: l.createdAt,
      })),
      fingerprints: fingerprints.map((f) => ({
        streamId: f.streamId,
        lineId: f.lineId,
        type: f.type,
        token: f.token,
        createdAt: f.createdAt,
      })),
      sameIpDetections: sameIp.map((d) => ({
        lineId: d.lineId,
        ip: d.ip,
        concurrentLines: d.concurrentLines,
        detectedAt: d.detectedAt,
      })),
    };

    const result = await aiChatJSON<{ detections: RestreamDetection[] }>(
      [
        {
          role: "system",
          content: `You are a piracy and restreaming detection specialist for an IPTV panel. Identify restreaming patterns:

INDICATORS:
- IP clustering: Multiple lines using the same IP addresses
- User-Agent patterns: Identical or suspicious UAs across multiple lines
- Timing patterns: Connections starting/stopping in sync across different lines
- Fingerprint matches: Same stream fingerprints found on different lines
- Connection volume: Lines exceeding their maxConnections limit
- Known restreamer flags: Lines already marked as isRestreamer

OUTPUT:
Return JSON: { detections: [{ lineId, lineUsername, confidence (0-1), indicators: string[], riskScore (0-100) }] }
Only include lines with confidence > 0.5. Sort by riskScore descending.`,
        },
        {
          role: "user",
          content: `Analyze these patterns for restreaming:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      { maxTokens: 2048 }
    );

    const detections = result.detections ?? [];

    const highRisk = detections.filter((d) => d.riskScore >= 70);
    if (highRisk.length > 0) {
      await prisma.aiInsight.createMany({
        data: highRisk.map((d) => ({
          type: "restream_risk",
          severity: d.riskScore >= 90 ? "critical" : "warning",
          title: `Restream risk: ${d.lineUsername}`,
          description: `Confidence: ${(d.confidence * 100).toFixed(0)}%. Indicators: ${d.indicators.join(", ")}`,
          data: { lineId: d.lineId, riskScore: d.riskScore, indicators: d.indicators },
          entityType: "line",
          entityId: d.lineId,
        })),
      });
    }

    return NextResponse.json({ detections });
  } catch (error) {
    console.error("Restream detector error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
