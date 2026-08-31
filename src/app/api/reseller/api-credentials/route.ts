import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { publicOriginFromRequest } from "@/lib/public-origin";
import {
  generatePanelApiKey,
  resellerApiBaseUrl,
  RESELLER_PANEL_API_ACTIONS,
} from "@/lib/panel-api-caller";
import { getResellerGroupFlags } from "@/lib/reseller-group-flags";

async function loadReseller(sessionId: string) {
  return prisma.panelUser.findUnique({
    where: { id: sessionId },
    select: { id: true, username: true, role: true, apiKey: true, resellerDns: true },
  });
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const flags = await getResellerGroupFlags(session.id);
  if (flags.hideAllUrls) {
    return NextResponse.json({ error: "API URLs are hidden for your group" }, { status: 403 });
  }

  const user = await loadReseller(session.id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requestOrigin = publicOriginFromRequest(req.url, req.headers).replace(/\/$/, "");
  const baseUrl = resellerApiBaseUrl(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      isAdmin: false,
      isReseller: true,
      resellerDns: user.resellerDns,
    },
    requestOrigin
  );

  return NextResponse.json({
    apiKey: user.apiKey,
    hasApiKey: Boolean(user.apiKey),
    showStreaming: flags.showStreamingApi,
    baseUrl,
    panelApiUrl: `${baseUrl}/api/v1`,
    example: user.apiKey
      ? `${baseUrl}/api/v1?api_key=${user.apiKey}&action=get_lines`
      : null,
    streaming: {
      playerApi: `${baseUrl}/player_api.php`,
      playlist: `${baseUrl}/get.php?username={username}&password={password}&type=m3u_plus&output=ts`,
      liveStream: `${baseUrl}/live/{username}/{password}/{stream_id}.ts`,
      stalkerPortal: `${baseUrl}/stalker_portal/server/load.php`,
      magPortal: `${baseUrl}/c/`,
    },
    allowedActions: [...RESELLER_PANEL_API_ACTIONS].sort(),
    note: "Use your panel API key — not line credentials. Actions are scoped to your lines and sub-users.",
  });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = generatePanelApiKey();
  await prisma.panelUser.update({
    where: { id: session.id },
    data: { apiKey },
  });

  return NextResponse.json({ ok: true, apiKey });
}
