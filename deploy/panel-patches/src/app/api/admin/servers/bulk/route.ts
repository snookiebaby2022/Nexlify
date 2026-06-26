import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { bumpConfigRevision, enqueueAgentCommand } from "@/lib/stream-agent";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const serverIds = Array.isArray(body.serverIds) ? body.serverIds.map(String) : [];
  if (!serverIds.length) {
    return NextResponse.json({ error: "Select at least one server" }, { status: 400 });
  }

  const action = String(body.action ?? "patch");

  if (action === "patch") {
    const data: Record<string, unknown> = {};
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.healthStatus !== undefined) data.healthStatus = String(body.healthStatus);
    if (body.proxyId !== undefined) data.proxyId = body.proxyId ? String(body.proxyId) : null;
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    const result = await prisma.streamServer.updateMany({
      where: { id: { in: serverIds } },
      data,
    });
    await logActivity("servers_mass_edit", {
      userId: session.id,
      entity: "server",
      meta: { count: result.count, fields: Object.keys(data) },
    });
    return NextResponse.json({ ok: true, affected: result.count });
  }

  const servers = await prisma.streamServer.findMany({
    where: { id: { in: serverIds } },
    select: { id: true, agentToken: true },
  });

  let queued = 0;
  let skipped = 0;

  for (const server of servers) {
    switch (action) {
      case "apply_config":
        if (!server.agentToken) {
          skipped++;
          break;
        }
        await bumpConfigRevision(server.id);
        queued++;
        break;
      case "nginx_reload":
        if (!server.agentToken) {
          skipped++;
          break;
        }
        await enqueueAgentCommand(server.id, "apply_config", { reason: "nginx_reload" });
        queued++;
        break;
      case "clear_cache":
        if (!server.agentToken) {
          skipped++;
          break;
        }
        await enqueueAgentCommand(server.id, "clear_cache");
        queued++;
        break;
      case "reboot_server":
        if (!server.agentToken) {
          skipped++;
          break;
        }
        await enqueueAgentCommand(server.id, "reboot_server");
        queued++;
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  }

  await logActivity(`servers_bulk_${action}`, {
    userId: session.id,
    entity: "server",
    meta: { queued, skipped, action },
  });

  return NextResponse.json({
    ok: true,
    queued,
    skipped,
    message:
      skipped > 0
        ? `${queued} queued, ${skipped} skipped (no agent token)`
        : `${queued} command(s) queued`,
  });
}
