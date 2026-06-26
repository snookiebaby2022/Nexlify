import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

type MassAction = "set" | "add" | "remove" | "clear";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const userIds: string[] = body.userIds ?? [];
  const action = body.action as MassAction;
  const bouquetIds: string[] = body.bouquetIds ?? [];

  if (!userIds.length) {
    return NextResponse.json({ error: "userIds required" }, { status: 400 });
  }

  const users = await prisma.panelUser.findMany({
    where: {
      id: { in: userIds },
      role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] },
    },
    select: { id: true },
  });

  if (!users.length) {
    return NextResponse.json({ error: "No matching resellers" }, { status: 400 });
  }

  if ((action === "add" || action === "remove") && !bouquetIds.length) {
    return NextResponse.json({ error: "bouquetIds required" }, { status: 400 });
  }

  let affected = 0;

  for (const { id: userId } of users) {
    switch (action) {
      case "clear":
        await prisma.resellerBouquet.deleteMany({ where: { userId } });
        affected++;
        break;
      case "set":
        await prisma.resellerBouquet.deleteMany({ where: { userId } });
        if (bouquetIds.length) {
          await prisma.resellerBouquet.createMany({
            data: bouquetIds.map((bouquetId) => ({ userId, bouquetId })),
            skipDuplicates: true,
          });
        }
        affected++;
        break;
      case "add":
        await prisma.resellerBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({ userId, bouquetId })),
          skipDuplicates: true,
        });
        affected++;
        break;
      case "remove":
        await prisma.resellerBouquet.deleteMany({
          where: { userId, bouquetId: { in: bouquetIds } },
        });
        affected++;
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, affected });
}
