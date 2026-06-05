import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const entity = body.entity as string;
  const ids: string[] = body.ids ?? [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  let count = 0;
  if (entity === "streams") {
    const r = await prisma.stream.deleteMany({ where: { id: { in: ids } } });
    count = r.count;
  } else if (entity === "lines") {
    const r = await prisma.line.deleteMany({ where: { id: { in: ids } } });
    count = r.count;
  } else if (entity === "users") {
    const r = await prisma.panelUser.deleteMany({
      where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
    });
    count = r.count;
  } else {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("stats");
  return NextResponse.json({ ok: true, count });
}
