import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [transactions, users] = await Promise.all([
    prisma.creditTransaction.findMany({
      include: { user: { select: { id: true, username: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.panelUser.findMany({
      where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } },
      select: { id: true, username: true, credits: true, role: true },
      orderBy: { username: "asc" },
    }),
  ]);

  return NextResponse.json({ transactions, users });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const userId = String(body.userId ?? "");
  const action = String(body.action ?? "add");
  const amount = Math.abs(Math.floor(Number(body.amount ?? 0)));
  const note = String(body.note ?? "").trim();

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (!amount) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });

  const user = await prisma.panelUser.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === PanelRole.ADMIN) {
    return NextResponse.json({ error: "Cannot adjust credits on admin accounts" }, { status: 400 });
  }

  let delta = amount;
  let defaultNote = "Admin credit add";

  if (action === "refund") {
    delta = amount;
    defaultNote = "Credit refund";
  } else if (action === "deduct") {
    delta = -amount;
    defaultNote = "Admin credit deduction";
    if (user.credits < amount) {
      return NextResponse.json(
        { error: `Insufficient balance (has ${user.credits}, deduct ${amount})` },
        { status: 400 }
      );
    }
  } else if (action === "add") {
    delta = amount;
    defaultNote = "Admin credit add";
  } else {
    return NextResponse.json({ error: "Invalid action (add, refund, deduct)" }, { status: 400 });
  }

  const balanceAfter = user.credits + delta;

  await prisma.$transaction([
    prisma.panelUser.update({
      where: { id: userId },
      data: { credits: balanceAfter },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount: delta,
        balanceAfter,
        note: note || defaultNote,
      },
    }),
  ]);

  await logActivity(action === "refund" ? "credit_refund" : action === "deduct" ? "credit_deduct" : "credit_add", {
    userId: session.id,
    entity: "user",
    entityId: userId,
    meta: { amount: delta, balanceAfter, note: note || defaultNote, target: user.username },
  });

  const updated = await prisma.panelUser.findUnique({
    where: { id: userId },
    select: { id: true, username: true, credits: true },
  });

  return NextResponse.json({ ok: true, user: updated, delta, balanceAfter });
}
