import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const resellers = await prisma.panelUser.findMany({
    where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } },
    include: {
      resellerBouquets: {
        include: {
          bouquet: {
            include: { _count: { select: { streams: true } } },
          },
        },
      },
    },
    orderBy: { username: "asc" },
  });
  const bouquets = await prisma.bouquet.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { streams: true, lines: true, resellerBouquets: true } },
    },
  });
  return NextResponse.json({ resellers, bouquets });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, bouquetIds } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.resellerBouquet.deleteMany({ where: { userId } });
  await prisma.resellerBouquet.createMany({
    data: (bouquetIds ?? []).map((bouquetId: string) => ({ userId, bouquetId })),
  });

  return NextResponse.json({ ok: true });
}
