import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const alerts = await prisma.activityLog.findMany({
    where: {
      action: {
        in: ["theft_detection_alert", "theft_vod_alert", "theft_stream_alert"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const settings = await getSettingGroup("theft");
  return NextResponse.json({ alerts, settings });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.settings) {
    await setSettingGroup("theft", body.settings);
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
