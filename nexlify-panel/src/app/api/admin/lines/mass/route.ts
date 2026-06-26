import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { LineStatus, PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const lineIds: string[] = body.lineIds ?? [];
  const action = body.action as string;

  if (!lineIds.length) {
    return NextResponse.json({ error: "lineIds required" }, { status: 400 });
  }

  const where =
    session.role === PanelRole.ADMIN
      ? { id: { in: lineIds } }
      : { id: { in: lineIds }, ownerId: session.id };

  let affected = 0;

  switch (action) {
    case "enable":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.ACTIVE },
        })
      ).count;
      break;
    case "disable":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.DISABLED },
        })
      ).count;
      break;
    case "ban":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.BANNED },
        })
      ).count;
      break;
    case "extend": {
      const days = Number(body.days ?? 30);
      const lines = await prisma.line.findMany({ where });
      for (const line of lines) {
        const expiresAt = new Date(line.expiresAt > new Date() ? line.expiresAt : new Date());
        expiresAt.setDate(expiresAt.getDate() + days);
        await prisma.line.update({ where: { id: line.id }, data: { expiresAt } });
        affected++;
      }
      break;
    }
    case "set_bouquets": {
      const bouquetIds: string[] = body.bouquetIds ?? [];
      for (const lineId of lineIds) {
        const line = await prisma.line.findFirst({ where: { ...where, id: lineId } });
        if (!line) continue;
        await prisma.lineBouquet.deleteMany({ where: { lineId } });
        await prisma.lineBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({ lineId, bouquetId })),
        });
        affected++;
      }
      break;
    }
    case "delete":
      affected = (await prisma.line.deleteMany({ where })).count;
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logActivity(`mass_${action}`, {
    userId: session.id,
    meta: { lineIds, affected },
  });

  return NextResponse.json({ ok: true, affected });
}
