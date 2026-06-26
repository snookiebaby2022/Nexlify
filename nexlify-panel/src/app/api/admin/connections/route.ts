import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listActiveConnections } from "@/lib/connections";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connections = await listActiveConnections();
  return NextResponse.json({ connections });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id === "all") {
    await prisma.liveConnection.deleteMany();
    return NextResponse.json({ ok: true });
  }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.liveConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
