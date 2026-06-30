import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const since = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 90 * 86400000);
  const until = toParam ? new Date(toParam) : new Date();

  const ownerFilter =
    session.role === "RESELLER" || session.role === "SUB_RESELLER"
      ? { ownerId: session.id }
      : {};

  const lines = await prisma.line.findMany({
    where: {
      ...ownerFilter,
      createdAt: { lte: until },
    },
    select: {
      id: true,
      username: true,
      owner: { select: { username: true, credits: true } },
      createdAt: true,
      expiresAt: true,
      status: true,
    },
  });

  const packages = await prisma.package.findMany({
    select: { id: true, name: true, creditCost: true, days: true, extraDeviceSlots: true },
  });

  const creditTx = await prisma.creditTransaction.findMany({
    where: {
      createdAt: { gte: since, lte: until },
      ...(session.role !== "ADMIN" ? { userId: session.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { username: true } } },
  });

  const rows = lines.map((line) => {
    const daysActive = Math.max(
      1,
      Math.ceil((Math.min(until.getTime(), line.expiresAt.getTime()) - line.createdAt.getTime()) / 86400000)
    );
    const estimatedCredits = packages[0]?.creditCost ?? 1;
    return {
      lineUsername: line.username,
      owner: line.owner?.username ?? "—",
      status: line.status,
      daysActive,
      estimatedProfitCredits: estimatedCredits,
      ownerCredits: line.owner?.credits ?? 0,
    };
  });

  const totalProfit = rows.reduce((s, r) => s + r.estimatedProfitCredits, 0);

  return NextResponse.json({
    summary: {
      lines: rows.length,
      totalEstimatedProfitCredits: totalProfit,
      creditTransactions: creditTx.length,
      from: since.toISOString(),
      to: until.toISOString(),
    },
    rows,
    creditTransactions: creditTx.map((t) => ({
      user: t.user.username,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      note: t.note,
      at: t.createdAt,
    })),
  });
}
