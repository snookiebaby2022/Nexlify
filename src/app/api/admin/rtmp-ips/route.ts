import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await prisma.rtmpEndpoint.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const item = await prisma.rtmpEndpoint.create({
    data: {
      name: body.name,
      host: body.host,
      port: Number(body.port ?? 1935),
      appName: body.appName || "live",
      notes: body.notes || null,
    },
  });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const item = await prisma.rtmpEndpoint.update({
    where: { id: body.id },
    data: {
      name: body.name,
      host: body.host,
      port: body.port != null ? Number(body.port) : undefined,
      appName: body.appName,
      notes: body.notes,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.rtmpEndpoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
