import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  dismissAllNotificationsForUser,
  dismissNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/panel-notifications";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

const INBOX_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(INBOX_ROLES);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const action = String(body.action ?? "").trim();

    if (action === "readAll") {
      const count = await markAllNotificationsRead(session);
      return NextResponse.json({ ok: true, count });
    }

    if (action === "dismissAll") {
      const count = await dismissAllNotificationsForUser(session);
      return NextResponse.json({ ok: true, count });
    }

    if (action === "dismiss") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) {
        return NextResponse.json({ error: "ids required" }, { status: 400 });
      }
      const count = await dismissNotificationsForUser(session, ids);
      return NextResponse.json({ ok: true, count });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
