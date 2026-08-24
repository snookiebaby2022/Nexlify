import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteNotification, updateNotification } from "@/lib/panel-notifications";
import { PanelNotificationPriority, PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: {
    isActive?: boolean;
    isPinned?: boolean;
    title?: string;
    body?: string;
    priority?: PanelNotificationPriority;
    expiresAt?: string | null;
  } = {};

  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (body.isPinned !== undefined) patch.isPinned = Boolean(body.isPinned);
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.body !== undefined) patch.body = String(body.body);
  if (body.priority !== undefined) {
    if (!Object.values(PanelNotificationPriority).includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    patch.priority = body.priority as PanelNotificationPriority;
  }
  if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt;

  try {
    const notification = await updateNotification(id, patch);
    return NextResponse.json({ notification });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const rateLimited = await guardAdminApiRequest(_req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteNotification(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
