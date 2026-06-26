import { NextRequest, NextResponse } from "next/server";
import { requireAgentServer } from "@/lib/agent-auth";
import { pollAgentCommands } from "@/lib/stream-agent";

export async function GET(req: NextRequest) {
  const server = await requireAgentServer(req);
  if (!server) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await pollAgentCommands(server.id);
  return NextResponse.json(data);
}
