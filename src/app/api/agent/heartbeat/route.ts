import { NextRequest, NextResponse } from "next/server";
import { requireAgentServer } from "@/lib/agent-auth";
import { handleAgentHeartbeat } from "@/lib/stream-agent";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const server = await requireAgentServer(req);
  if (!server) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await handleAgentHeartbeat(server.id, {
    ...body,
    version: typeof body.version === "string" ? body.version : undefined,
    processes: Array.isArray(body.processes) ? body.processes : undefined,
  });

  return NextResponse.json({ ok: true, serverId: server.id });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
