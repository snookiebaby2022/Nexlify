import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { getLogAutoClearHours, setLogAutoClearHours } from "@/lib/log-maintenance";
import { parseLogAutoClearHours } from "@/lib/log-page";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ hours: await getLogAutoClearHours() });
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const hours = parseLogAutoClearHours((parsed.data as { hours?: unknown }).hours);
    const saved = await setLogAutoClearHours(hours);
    return NextResponse.json({ hours: saved });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
