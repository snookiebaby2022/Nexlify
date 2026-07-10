import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const affiliateId = req.nextUrl.searchParams.get("affiliateId");
  const status = req.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (affiliateId) where.affiliateId = affiliateId;
  if (status) where.status = status;

  const commissions = await prisma.commission.findMany({
    where,
    include: {
      affiliate: {
        include: { user: { select: { username: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ commissions });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, status, paidAt } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const commission = await prisma.commission.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
    },
  });

  return NextResponse.json({ commission });
}
