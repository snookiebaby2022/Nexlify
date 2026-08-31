import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { publicOriginFromRequest } from "@/lib/public-origin";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { getResellerGroupFlags } from "@/lib/reseller-group-flags";
import { prisma } from "@/lib/prisma";
import { resellerApiBaseUrl } from "@/lib/panel-api-caller";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const flags = await getResellerGroupFlags(session.id);
  if (!flags.showStreamingApi) {
    return NextResponse.json({ error: "Streaming API is disabled for your group" }, { status: 403 });
  }

  const user = await prisma.panelUser.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, role: true, resellerDns: true },
  });
  const requestOrigin = publicOriginFromRequest(req.url, req.headers).replace(/\/$/, "");
  const baseUrl = user
    ? resellerApiBaseUrl(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          isAdmin: false,
          isReseller: true,
          resellerDns: user.resellerDns,
        },
        requestOrigin
      )
    : requestOrigin;

  return NextResponse.json({
    baseUrl,
    endpoints: {
      playerApi: `${baseUrl}/player_api.php`,
      playlist: `${baseUrl}/get.php?username={username}&password={password}&type=m3u_plus&output=ts`,
      liveStream: `${baseUrl}/live/{username}/{password}/{stream_id}.ts`,
      stalkerPortal: `${baseUrl}/stalker_portal/server/load.php`,
      magPortal: `${baseUrl}/c/`,
    },
    note: "Replace {username} and {password} with a line you own. Do not share admin panel credentials.",
  });
}
