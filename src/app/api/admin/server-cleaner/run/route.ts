import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id") ?? (await req.json()).id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const task = await prisma.serverCleanerTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.serverCleanerTask.update({
    where: { id },
    data: {
      status: "RUNNING",
      lastRunAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, task: updated });
}
