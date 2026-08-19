import { NextRequest, NextResponse } from "next/server";
import { requireAgentServer } from "@/lib/agent-auth";
import { ackAgentCommand } from "@/lib/stream-agent";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const server = await requireAgentServer(req);
  if (!server) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const commandId = String(body.commandId ?? "");
  if (!commandId) {
    return NextResponse.json({ error: "commandId required" }, { status: 400 });
  }

  await ackAgentCommand(commandId, server.id, body.ok !== false, body.result);
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
