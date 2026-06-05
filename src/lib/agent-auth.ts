import { NextRequest } from "next/server";
import { getServerByAgentToken } from "@/lib/stream-agent";

export async function requireAgentServer(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-agent-token");
  const server = await getServerByAgentToken(token);
  return server;
}
