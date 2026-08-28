import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  createNotification,
  listAdminNotifications,
  listResellerOptions,
} from "@/lib/panel-notifications";
import {
  PanelNotificationKind,
  PanelNotificationPriority,
  PanelNotificationTarget,
  PanelRole,
} from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(10, Number(req.nextUrl.searchParams.get("pageSize") ?? 25))
  );

  const [adminList, resellers] = await Promise.all([
    listAdminNotifications({ page, pageSize }),
    listResellerOptions(),
  ]);

  return NextResponse.json({
    notifications: adminList.notifications,
    total: adminList.total,
    page: adminList.page,
    pageSize: adminList.pageSize,
    resellers,
  });
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

  const target = body.target as PanelNotificationTarget;
  if (
    !Object.values(PanelNotificationTarget).includes(target)
  ) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const kind = body.kind as PanelNotificationKind;
  if (!Object.values(PanelNotificationKind).includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const priority = (body.priority as PanelNotificationPriority) ?? PanelNotificationPriority.NORMAL;
  if (!Object.values(PanelNotificationPriority).includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  try {
    const notification = await createNotification(session.id, {
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      kind,
      priority,
      target,
      recipientId: body.recipientId ?? null,
      isPinned: Boolean(body.isPinned),
      expiresAt: body.expiresAt ?? null,
    });
    return NextResponse.json({ notification });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create notification";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
