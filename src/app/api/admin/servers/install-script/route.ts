import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { generateAgentToken } from "@/lib/stream-agent";
import fs from "fs";
import path from "path";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const panelUrl = String(body.panelUrl ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/$/, "");
  const serverName = String(body.serverName ?? "Stream-1");
  const host = String(body.host ?? "").trim();

  const token = generateAgentToken();
  const scriptPath = path.join(process.cwd(), "scripts", "nexlify-server-install.sh");
  let script = "";
  if (fs.existsSync(scriptPath)) {
    script = fs.readFileSync(scriptPath, "utf8");
  }

  const oneLiner = `curl -fsSL ${panelUrl}/scripts/nexlify-server-install.sh | sudo PANEL_URL="${panelUrl}" AGENT_TOKEN="${token}" bash`;

  return NextResponse.json({
    serverName,
    host,
    agentToken: token,
    panelUrl,
    installCommand: oneLiner,
    script,
    steps: [
      "SSH into the stream VPS as root",
      "Run the install command below",
      "In Nexlify Admin → Servers → Add server, enter host and paste agent token",
      "Save server — agent should appear online within 1–2 minutes",
    ],
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
