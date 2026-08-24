import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { canManageSubUsers, directSubUserWhere } from "@/lib/reseller-sub-users";
import { logActivity } from "@/lib/lines";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
/** Mass enable / disable / setGroup for the reseller’s direct sub-users only. */
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session || !canManageSubUsers(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const action = String(body.action ?? "");
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const owned = await prisma.panelUser.findMany({
    where: { id: { in: ids }, ...directSubUserWhere(session.id) },
    select: { id: true },
  });
  const ownedIds = owned.map((u) => u.id);
  if (!ownedIds.length) {
    return NextResponse.json({ error: "No matching sub-users in your tree" }, { status: 400 });
  }

  let count = 0;

  if (action === "enable" || action === "disable") {
    const r = await prisma.panelUser.updateMany({
      where: { id: { in: ownedIds } },
      data: { isActive: action === "enable" },
    });
    count = r.count;
  } else if (action === "setGroup") {
    const raw = body.groupId;
    const groupId =
      raw === null || raw === undefined || raw === "" ? null : String(raw);
    if (groupId) {
      const group = await prisma.userGroup.findUnique({
        where: { id: groupId },
        select: { id: true },
      });
      if (!group) {
        return NextResponse.json({ error: "Group not found" }, { status: 400 });
      }
    }
    const r = await prisma.panelUser.updateMany({
      where: { id: { in: ownedIds } },
      data: { groupId },
    });
    count = r.count;
  } else {
    return NextResponse.json(
      { error: "Unknown action (use enable, disable, or setGroup)" },
      { status: 400 }
    );
  }

  await logActivity(`mass_users_${action}`, {
    userId: session.id,
    meta: { count, ids: ownedIds.slice(0, 50), action, scope: "reseller" },
  });

  return NextResponse.json({ ok: true, count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
