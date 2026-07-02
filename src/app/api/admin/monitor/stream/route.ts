import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events — real-time panel monitor (connections, servers). */
export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let ticks = 0;
      const maxTicks = 120;

      const interval = setInterval(async () => {
        ticks += 1;
        if (ticks > maxTicks) {
          clearInterval(interval);
          controller.close();
          return;
        }

        try {
          const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
          const [connections, servers, issues] = await Promise.all([
            prisma.liveConnection.count({ where: { lastSeenAt: { gte: staleBefore } } }),
            prisma.streamServer.findMany({
              where: { isActive: true },
              select: { id: true, name: true, healthStatus: true, bandwidthMbps: true },
              take: 50,
            }),
            prisma.streamIssue.count({ where: { resolvedAt: null } }),
          ]);

          send({
            ts: new Date().toISOString(),
            connections,
            openIssues: issues,
            servers: servers.map((s) => ({
              id: s.id,
              name: s.name,
              health: s.healthStatus,
              bandwidthMbps: s.bandwidthMbps,
            })),
          });
        } catch {
          send({ error: "tick_failed", ts: new Date().toISOString() });
        }
      }, 5000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
