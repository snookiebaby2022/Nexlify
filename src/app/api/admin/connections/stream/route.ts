import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { listAdminConnections } from "@/lib/admin-connections-list";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { denyUnlessResellerPermission, RESELLER_PERMS } from "@/lib/reseller-permissions";
import {
  liveConnectionsGeneration,
  waitForLiveConnectionsChange,
} from "@/lib/connection-live-bus";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;
const KEEP_ALIVE_MS = 2_500;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([...ROLES]);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const viewDenied = await denyUnlessResellerPermission(session, RESELLER_PERMS.CONNECTIONS_VIEW);
  if (viewDenied) return viewDenied;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      const tick = async () => {
        try {
          const connections = await listAdminConnections(session);
          send({ connections });
        } catch (err) {
          send({ error: String(err) });
        }
      };
      let gen = liveConnectionsGeneration();
      await tick();
      while (!req.signal.aborted) {
        gen = await waitForLiveConnectionsChange(gen, KEEP_ALIVE_MS, req.signal);
        if (req.signal.aborted) break;
        await tick();
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
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
