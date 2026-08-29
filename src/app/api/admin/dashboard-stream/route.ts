import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { isTestConnectionIp, listLiveConnections } from "@/lib/connections";
import { getDashboardNicBandwidthMbps } from "@/lib/host-metrics";
import { getServerPollIntervals } from "@/lib/perf-polling";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

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
          const [rows, activeLines] = await Promise.all([
            listLiveConnections(ownerId, 400),
            prisma.line.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
          ]);

          const live = rows.filter((r) => !isTestConnectionIp(r.ip));
          const users = new Set(live.map((r) => r.lineId));
          const streams = new Set(live.map((r) => r.streamId).filter(Boolean));

          const { networkInMbps, networkOutMbps } = await getDashboardNicBandwidthMbps();

          send({
            timestamp: now.toISOString(),
            onlineConnections: live.length,
            onlineUsers: users.size,
            onlineStreams: streams.size,
            totalActiveLines: activeLines,
            networkInMbps,
            networkOutMbps,
            connections: live.slice(0, 10).map((c) => ({
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
