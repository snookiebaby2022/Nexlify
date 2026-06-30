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

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [notifications, resellers] = await Promise.all([
    listAdminNotifications(),
    listResellerOptions(),
  ]);

  return NextResponse.json({ notifications, resellers });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
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
}
