import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [user, transactions] = await Promise.all([
    prisma.panelUser.findUnique({
      where: { id: session.id },
      select: { credits: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        balanceAfter: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    credits: user?.credits ?? 0,
    transactions,
  });
}
