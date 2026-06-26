import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeMac } from "@/lib/mag";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lineFilter =
    session.role === PanelRole.ADMIN
      ? {}
      : { line: { ownerId: session.id } };

  const devices = await prisma.magDevice.findMany({
    where: lineFilter,
    include: { line: { select: { username: true, id: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const mac = normalizeMac(String(body.mac ?? ""));
  const lineId = String(body.lineId ?? "");

  if (!mac || !lineId) {
    return NextResponse.json({ error: "mac and lineId required" }, { status: 400 });
  }

  const device = await prisma.magDevice.create({
    data: {
      mac,
      lineId,
      model: body.model,
    },
    include: { line: true },
  });

  return NextResponse.json({ device });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: { mac?: string; lineId?: string; model?: string | null; isActive?: boolean } = {};
  if (body.mac != null) data.mac = normalizeMac(String(body.mac));
  if (body.lineId != null) data.lineId = String(body.lineId);
  if (body.model !== undefined) data.model = body.model ? String(body.model) : null;
  if (body.isActive != null) data.isActive = Boolean(body.isActive);

  const device = await prisma.magDevice.update({
    where: { id },
    data,
    include: { line: { select: { username: true, id: true } } },
  });
  return NextResponse.json({ device });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.magDevice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
