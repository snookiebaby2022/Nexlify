import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

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
    for (const id of ids) {
      const user = await prisma.panelUser.findUnique({ where: { id } });
      if (!user || user.role === PanelRole.ADMIN) continue;
      const balance = user.credits + amount;
      await prisma.panelUser.update({ where: { id }, data: { credits: balance } });
      await prisma.creditTransaction.create({
        data: { userId: id, amount, balanceAfter: balance, note: "Mass edit" },
      });
      count++;
    }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count });
}
