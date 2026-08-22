import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";
import { LIVE_STALE_MS, countDistinctActiveConnections, listLiveConnections } from "@/lib/connections";
import { sampleLocalHostMetrics } from "@/lib/host-metrics";
import { getServerPollIntervals } from "@/lib/perf-polling";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const ownerId = session.role === "ADMIN" ? undefined : session.id;
  const { dashboardSseMs } = await getServerPollIntervals();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const update = async () => {
        try {
          const now = new Date();
          const connStaleBefore = new Date(Date.now() - LIVE_STALE_MS);
          const ownerSql = ownerId
            ? Prisma.sql`AND lc."lineId" IN (SELECT id FROM "Line" WHERE "ownerId" = ${ownerId})`
            : Prisma.empty;

          const [onlineConnections, bandwidthSnap, activeLines, sampleConns, distinctRow] =
            await Promise.all([
            countDistinctActiveConnections(ownerId),
            prisma.bandwidthSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
            prisma.line.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
            listLiveConnections(ownerId, 10),
            prisma.$queryRaw<Array<{ users: bigint; streams: bigint }>>`
              SELECT COUNT(DISTINCT lc."lineId")::bigint AS users,
                     COUNT(DISTINCT lc."streamId") FILTER (WHERE lc."streamId" IS NOT NULL)::bigint AS streams
              FROM "LiveConnection" lc
              WHERE lc."lastSeenAt" >= ${connStaleBefore}
              ${ownerSql}
            `,
          ]);

          const onlineUsers = Number(distinctRow[0]?.users ?? 0);
          const onlineStreams = Number(distinctRow[0]?.streams ?? 0);

          const nic = sampleLocalHostMetrics();
          let networkOutMbps = nic.uploadMbps;
          let networkInMbps = nic.downloadMbps;
          if (networkOutMbps <= 0 && networkInMbps <= 0 && bandwidthSnap) {
            networkOutMbps = Math.round((Number(bandwidthSnap.bytesOut) / 125000 / 60) * 10) / 10;
            networkInMbps = Math.round((Number(bandwidthSnap.bytesIn) / 125000 / 60) * 10) / 10;
          }

          send({
            timestamp: now.toISOString(),
            onlineConnections,
            onlineUsers,
            onlineStreams,
            totalActiveLines: activeLines,
            networkInMbps,
            networkOutMbps,
            connections: sampleConns.map((c) => ({
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

      update();
      const interval = setInterval(update, dashboardSseMs);

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
