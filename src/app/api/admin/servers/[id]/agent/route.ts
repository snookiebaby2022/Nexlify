import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bumpConfigRevision,
  enqueueAgentCommand,
  generateAgentToken,
} from "@/lib/stream-agent";
import { logActivity } from "@/lib/lines";
import { STREAM_HTTP_PORT } from "@/lib/server-ports";
import { PanelRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const server = await prisma.streamServer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      agentToken: true,
      agentLastSeen: true,
      agentVersion: true,
      configRevision: true,
      agentSshHost: true,
      agentSshPort: true,
      agentSshUser: true,
      agentUseSsh: true,
    },
  });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasToken = Boolean(server.agentToken);
  return NextResponse.json({
    server: {
      ...server,
      agentToken: hasToken ? `${server.agentToken!.slice(0, 8)}…` : null,
    },
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  const action = String(body.action ?? "");

  const server = await prisma.streamServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  switch (action) {
    case "generate_token": {
      const token = generateAgentToken();
      await prisma.streamServer.update({
        where: { id },
        data: { agentToken: token },
      });
      await logActivity("agent_token_generated", { userId: session.id, entity: "server", entityId: id });
      return NextResponse.json({ agentToken: token });
    }
    case "rotate_token": {
      const token = generateAgentToken();
      await prisma.streamServer.update({
        where: { id },
        data: { agentToken: token },
      });
      await logActivity("agent_token_rotated", {
        userId: session.id,
        entity: "server",
        entityId: id,
      });
      return NextResponse.json({ agentToken: token });
    }
    case "revoke_token": {
      await prisma.streamServer.update({
        where: { id },
        data: { agentToken: null },
      });
      return NextResponse.json({ ok: true });
    }
    case "apply_config": {
      if (!server.agentToken) {
        return NextResponse.json({ error: "Generate agent token first" }, { status: 400 });
      }
      const revision = await bumpConfigRevision(id);
      await logActivity("agent_apply_config", {
        userId: session.id,
        entity: "server",
        entityId: id,
        meta: { revision },
      });
      return NextResponse.json({ ok: true, revision });
    }
    case "restart_stream": {
      const streamId = String(body.streamId ?? "");
      if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });
      await enqueueAgentCommand(id, "restart_stream", { streamId });
      return NextResponse.json({ ok: true });
    }
    case "stop_stream": {
      const streamId = String(body.streamId ?? "");
      if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });
      await enqueueAgentCommand(id, "stop_stream", { streamId });
      return NextResponse.json({ ok: true });
    }
    case "start_stream": {
      const streamId = String(body.streamId ?? "");
      if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });
      await enqueueAgentCommand(id, "start_stream", { streamId });
      return NextResponse.json({ ok: true });
    }
    case "save_ssh": {
      await prisma.streamServer.update({
        where: { id },
        data: {
          agentSshHost: body.agentSshHost ? String(body.agentSshHost) : null,
          agentSshPort: body.agentSshPort != null ? Number(body.agentSshPort) : 22,
          agentSshUser: body.agentSshUser ? String(body.agentSshUser) : null,
          agentUseSsh: Boolean(body.agentUseSsh),
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "nginx_reload": {
      if (!server.agentToken) {
        return NextResponse.json({ error: "Generate agent token first" }, { status: 400 });
      }
      await enqueueAgentCommand(id, "apply_config", { reason: "nginx_reload" });
      return NextResponse.json({ ok: true });
    }
    case "clear_cache": {
      if (!server.agentToken) {
        return NextResponse.json({ error: "Generate agent token first" }, { status: 400 });
      }
      await enqueueAgentCommand(id, "clear_cache");
      return NextResponse.json({ ok: true, note: "Queued for agent (panel cache unchanged)" });
    }
    case "reboot_server": {
      if (!server.agentToken) {
        return NextResponse.json({ error: "Generate agent token first" }, { status: 400 });
      }
      await enqueueAgentCommand(id, "reboot_server");
      return NextResponse.json({
        ok: true,
        note: "Reboot command queued — requires agent/SSH support on the stream node",
      });
    }
    case "force_online": {
      const now = new Date();
      await prisma.streamServer.update({
        where: { id },
        data: {
          healthStatus: "online",
          healthMessage: "Marked online by admin",
          lastHealthAt: now,
        },
      });
      return NextResponse.json({ ok: true, note: "Marked online" });
    }
    case "test_health": {
      const port = server.port || STREAM_HTTP_PORT;
      const proto = server.protocol === "https" ? "https" : "http";
      const url = `${proto}://${server.host}:${port}/`;
      const now = new Date();
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Nexlify-Panel-Health/1.0" },
        });
        const status = res.ok || res.status < 500 ? "online" : "degraded";
        await prisma.streamServer.update({
          where: { id },
          data: {
            healthStatus: status,
            healthMessage: `HTTP ${res.status}`,
            lastHealthAt: now,
          },
        });
        return NextResponse.json({ ok: true, note: `HTTP ${res.status}`, status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await prisma.streamServer.update({
          where: { id },
          data: {
            healthStatus: "offline",
            healthMessage: message,
            lastHealthAt: now,
          },
        });
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
      }
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
