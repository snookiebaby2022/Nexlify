import { NextRequest, NextResponse } from "next/server";
import { requireAgentServer } from "@/lib/agent-auth";
import { handleAgentHeartbeat } from "@/lib/stream-agent";

export async function POST(req: NextRequest) {
  const server = await requireAgentServer(req);
  if (!server) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  await handleAgentHeartbeat(server.id, {
    version: body.version,
    processes: body.processes,
  });

  return NextResponse.json({ ok: true, serverId: server.id });
}
