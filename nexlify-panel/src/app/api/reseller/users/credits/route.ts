import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const userId = String(body.userId ?? "");
  const action = String(body.action ?? "add") as "add" | "refund" | "deduct";
  const amount = Math.max(0, Math.floor(Number(body.amount ?? 0)));
  if (!userId || amount <= 0) {
    return NextResponse.json({ error: "userId and positive amount required" }, { status: 400 });
  }

  const child = await prisma.panelUser.findFirst({
    where: { id: userId, parentId: session.id, role: PanelRole.SUB_RESELLER },
  });
  if (!child) return NextResponse.json({ error: "Sub-reseller not found" }, { status: 404 });

  const parent = await prisma.panelUser.findUnique({ where: { id: session.id } });
  if (!parent) return NextResponse.json({ error: "Session invalid" }, { status: 403 });

  let childDelta = amount;
  let parentDelta = -amount;

  if (action === "deduct") {
    childDelta = -Math.min(amount, child.credits);
    parentDelta = 0;
  } else if (action === "refund") {
    childDelta = -Math.min(amount, child.credits);
    parentDelta = -childDelta;
  } else if (amount > parent.credits) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const freshParent = await tx.panelUser.findUniqueOrThrow({ where: { id: session.id } });
    const freshChild = await tx.panelUser.findUniqueOrThrow({ where: { id: userId } });

    if (childDelta > 0 && childDelta > freshParent.credits) {
      throw new Error("Insufficient credits");
    }

    const updatedParent = await tx.panelUser.update({
      where: { id: session.id },
      data: { credits: { increment: parentDelta } },
    });
    const updatedChild = await tx.panelUser.update({
      where: { id: userId },
      data: { credits: { increment: childDelta } },
    });

    if (parentDelta !== 0) {
      await tx.creditTransaction.create({
        data: {
          userId: session.id,
          amount: parentDelta,
          balanceAfter: updatedParent.credits,
          note: body.note ? String(body.note) : `Credits ${action} for ${child.username}`,
        },
      });
    }
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: childDelta,
        balanceAfter: updatedChild.credits,
        note: body.note ? String(body.note) : `Credits ${action} by parent`,
      },
    });
    return updatedChild;
  }).catch((e: Error) => {
    return null;
  });

  if (!result) {
    return NextResponse.json({ error: "Insufficient credits or transfer failed" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    delta: childDelta,
    user: { id: result.id, username: result.username, credits: result.credits },
    balanceAfter: result.credits,
  });
}
