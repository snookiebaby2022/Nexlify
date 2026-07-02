import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON, isAiConfigured } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

interface Anomaly {
  type: string;
  severity: string;
  entityType: string;
  entityId?: string;
  description: string;
  data?: Record<string, unknown>;
}

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isAiConfigured()) {
      return NextResponse.json(
        { error: "AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel." },
        { status: 503 }
      );
    }

    const recentWindow = new Date(Date.now() - 60 * 60 * 1000);

    let connections: any[] = [];
    let geoData: any[] = [];
    let deviceBindings: any[] = [];
    let sameIpDetections: any[] = [];

    try {
      [connections, geoData, deviceBindings, sameIpDetections] = await Promise.all([
        prisma.liveConnection.findMany({
          where: { lastSeenAt: { gte: recentWindow } },
          include: { line: { select: { username: true } }, stream: { select: { name: true } } },
          orderBy: { startedAt: "desc" },
          take: 500,
        }),
        prisma.connectionGeography.findMany({
          where: { lastSeenAt: { gte: recentWindow } },
          orderBy: { lastSeenAt: "desc" },
          take: 200,
        }),
        prisma.deviceBinding.findMany({
          where: { lastSeenAt: { gte: recentWindow } },
          orderBy: { lastSeenAt: "desc" },
          take: 200,
        }),
        prisma.sameIpDetection.findMany({
          where: { detectedAt: { gte: recentWindow } },
          orderBy: { detectedAt: "desc" },
          take: 100,
        }),
      ]);
    } catch {
      // Some tables may not exist on older databases
    }

    const input = {
      connections: connections.map((c) => ({
        id: c.id,
        lineId: c.lineId,
        lineUsername: c.line?.username,
        streamName: c.stream?.name,
        ip: c.ip,
        userAgent: c.userAgent,
        startedAt: c.startedAt,
        lastSeenAt: c.lastSeenAt,
      })),
      geoData: geoData.map((g) => ({
        lineId: g.lineId,
        country: g.country,
        countryCode: g.countryCode,
        lat: g.lat,
        lng: g.lng,
        connectionCount: g.connectionCount,
        lastSeenAt: g.lastSeenAt,
      })),
      deviceBindings: deviceBindings.map((d) => ({
        lineId: d.lineId,
        deviceType: d.deviceType,
        ip: d.ip,
        lastSeenAt: d.lastSeenAt,
      })),
      sameIpDetections: sameIpDetections.map((d) => ({
        lineId: d.lineId,
        ip: d.ip,
        concurrentLines: d.concurrentLines,
        detectedAt: d.detectedAt,
      })),
    };

    const result = await aiChatJSON<{ anomalies: Anomaly[]; summary: string }>(
      [
        {
          role: "system",
          content: `You are a security and fraud detection analyst for an IPTV panel. Detect anomalies:

1. SHARING: Same IP with >3 concurrent connections (multiple lines from same IP)
2. GEO_IMPOSSIBLE_TRAVEL: Same line connecting from countries >5000km apart within 10 minutes
3. BANDWIDTH_SPIKE: Sudden bandwidth increase >3x normal levels
4. CONNECTION_FLOOD: >10 new connections in 1 minute from the same IP

Classify severity as info, warning, or critical.
Return JSON: { anomalies: [{ type, severity, entityType, entityId, description, data }], summary: "overall summary" }`,
        },
        {
          role: "user",
          content: `Analyze these connection patterns for anomalies:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      { maxTokens: 2048 }
    );

    const anomalies = result.anomalies ?? [];

    if (anomalies.length > 0) {
      await prisma.aiAnomalyLog.createMany({
        data: anomalies.map((a) => ({
          type: a.type,
          severity: a.severity,
          entityType: a.entityType,
          entityId: a.entityId,
          description: a.description,
          data: a.data ? JSON.parse(JSON.stringify(a.data)) : undefined,
        })),
      });
    }

    return NextResponse.json({ anomalies, summary: result.summary });
  } catch (error) {
    console.error("Anomaly detector error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
