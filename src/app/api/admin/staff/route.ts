import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import {
  PERMS,
  STAFF_PRESETS,
  describePermission,
  permissionsForPreset,
} from "@/lib/staff-permissions";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staff = await prisma.panelUser.findMany({
    where: { role: PanelRole.STAFF },
    select: {
      id: true,
      username: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    staff,
    presets: STAFF_PRESETS,
    allPermissions: Object.values(PERMS).map((p) => ({ id: p, label: describePermission(p) })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const action = String(body.action ?? "create");

    if (action === "create") {
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? Math.random().toString(36).slice(2, 10));
      const preset = String(body.preset ?? "support_agent");
      if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });
      const user = await prisma.panelUser.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          role: PanelRole.STAFF,
          permissions: permissionsForPreset(preset),
          parentId: session.id,
        },
        select: { id: true, username: true, permissions: true },
      });
      return NextResponse.json({ user, password });
    }

    if (action === "update-permissions") {
      const id = String(body.id ?? "");
      const permissions = Array.isArray(body.permissions)
        ? body.permissions.map(String)
        : permissionsForPreset(String(body.preset ?? ""));
      const user = await prisma.panelUser.update({
        where: { id },
        data: { permissions },
        select: { id: true, username: true, permissions: true },
      });
      return NextResponse.json({ user });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
