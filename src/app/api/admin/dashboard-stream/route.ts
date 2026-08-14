import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { listLiveConnections } from "@/lib/connections";
import { sampleLocalHostMetrics } from "@/lib/host-metrics";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const update = async () => {
        try {
          const now = new Date();

          const [connections, bandwidthSnap, activeLines] = await Promise.all([
            listLiveConnections(session.role === "ADMIN" ? undefined : session.id),
            prisma.bandwidthSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
            prisma.line.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
          ]);

          const nic = sampleLocalHostMetrics();
          let networkOutMbps = nic.uploadMbps;
          let networkInMbps = nic.downloadMbps;
          if (networkOutMbps <= 0 && networkInMbps <= 0 && bandwidthSnap) {
            networkOutMbps = Math.round((Number(bandwidthSnap.bytesOut) / 125000 / 60) * 10) / 10;
            networkInMbps = Math.round((Number(bandwidthSnap.bytesIn) / 125000 / 60) * 10) / 10;
          }

          send({
            timestamp: now.toISOString(),
            onlineConnections: connections.length,
            onlineUsers: new Set(connections.map((c) => c.lineId)).size,
            onlineStreams: new Set(connections.map((c) => c.streamId).filter(Boolean)).size,
            totalActiveLines: activeLines,
            networkInMbps,
            networkOutMbps,
            connections: connections.slice(0, 50).map((c) => ({
              id: c.id,
              line: c.line?.username ?? "unknown",
              stream: c.stream?.name ?? "unknown",
              startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
              lastSeenAt: c.lastSeenAt instanceof Date ? c.lastSeenAt.toISOString() : String(c.lastSeenAt),
            })),
          });
        } catch (err) {
          send({ error: String(err) });
        }
      };

      // Send initial data
      update();

      // Send updates every 5 seconds
      const interval = setInterval(update, 5000);

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    },
  });
}
