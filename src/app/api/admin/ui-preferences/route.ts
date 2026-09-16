import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { getAdminUiPreferences, saveAdminUiPreferences } from "@/lib/admin-ui-preferences";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prefs = await getAdminUiPreferences(session.id);
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as {
      sidebarOrder?: unknown;
      sidebarHiddenKeys?: unknown;
      sidebarAccentColor?: unknown;
    };
    const patch: {
      sidebarOrder?: string[];
      sidebarHiddenKeys?: string[];
      sidebarAccentColor?: string;
    } = {};
    if (Array.isArray(body.sidebarOrder)) {
      patch.sidebarOrder = body.sidebarOrder.filter((k): k is string => typeof k === "string");
    }
    if (Array.isArray(body.sidebarHiddenKeys)) {
      patch.sidebarHiddenKeys = body.sidebarHiddenKeys.filter((k): k is string => typeof k === "string");
    }
    if (body.sidebarAccentColor !== undefined) {
      patch.sidebarAccentColor =
        typeof body.sidebarAccentColor === "string" ? body.sidebarAccentColor : "";
    }

    const preferences = await saveAdminUiPreferences(session.id, patch);
    return NextResponse.json({ ok: true, preferences });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
