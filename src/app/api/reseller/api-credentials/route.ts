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
import { denyUnlessResellerPermission, RESELLER_PERMS } from "@/lib/reseller-permissions";

async function loadReseller(sessionId: string) {
  return prisma.panelUser.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      username: true,
      role: true,
      apiKey: true,
      accessCode: true,
      resellerDns: true,
    },
  });
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiDenied = await denyUnlessResellerPermission(session, RESELLER_PERMS.API_ACCESS);
  if (apiDenied) return apiDenied;

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
      ? {
          url: `${baseUrl}/api/v1?action=get_lines`,
          headers: { "X-API-Key": "{key}" },
        }
      : null,
    oneStream: {
      apiKey: user.apiKey,
      apiToken: user.accessCode,
      auth: "Authorization: Bearer {API_KEY}:{API_TOKEN}",
      endpoints: {
        create: `${baseUrl}/api/lines/create`,
        status: `${baseUrl}/api/lines/status`,
        renew: `${baseUrl}/api/lines/renew`,
        delete: `${baseUrl}/api/lines/delete`,
      },
    },
    nxt: {
      apiKey: "{API_KEY}",
      auth: "X-API-Key: {API_KEY}",
      endpoints: {
        lines: `${baseUrl}/api/lines`,
        packages: `${baseUrl}/api/packages`,
        create: `${baseUrl}/api/lines/create`,
        status: `${baseUrl}/api/lines/status/{id}`,
        renew: `${baseUrl}/api/lines/renew/{id}`,
      },
    },
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

  const apiDenied = await denyUnlessResellerPermission(session, RESELLER_PERMS.API_ACCESS);
  if (apiDenied) return apiDenied;

  const apiKey = generatePanelApiKey();
  const apiToken = generatePanelApiKey();
  await prisma.panelUser.update({
    where: { id: session.id },
    data: { apiKey, accessCode: apiToken },
  });

  return NextResponse.json({ ok: true, apiKey, apiToken });
}
