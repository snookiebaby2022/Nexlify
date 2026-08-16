import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { logActivity } from "@/lib/lines";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const ids: string[] = body.ids ?? [];
  const action = body.action as string;
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  let count = 0;

  if (action === "enable" || action === "disable") {
    const r = await prisma.panelUser.updateMany({
      where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
      data: { isActive: action === "enable" },
    });
    count = r.count;
  } else if (action === "addCredits") {
    const amount = Number(body.credits ?? 0);
    if (amount !== 0) {
      const users = await prisma.panelUser.findMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
        select: { id: true, credits: true },
      });
      if (users.length > 0) {
        await prisma.$transaction([
          ...users.map((u) =>
            prisma.panelUser.update({
              where: { id: u.id },
              data: { credits: u.credits + amount },
            })
          ),
          ...users.map((u) =>
            prisma.creditTransaction.create({
              data: { userId: u.id, amount, balanceAfter: u.credits + amount, note: "Mass edit" },
            })
          ),
        ]);
        count = users.length;
      }
    }
  } else if (action === "setGroup") {
    const raw = body.groupId;
    const groupId =
      raw === null || raw === undefined || raw === ""
        ? null
        : String(raw);

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
      where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
      data: { groupId },
    });
    count = r.count;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logActivity(`mass_users_${action}`, {
    userId: session.id,
    meta: { count, ids: ids.slice(0, 50), action, groupId: body.groupId ?? null },
  });

  return NextResponse.json({ ok: true, count });
}
