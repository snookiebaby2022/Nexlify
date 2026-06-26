import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const codes = await prisma.accessCode.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const code = String(body.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const item = await prisma.accessCode.create({
    data: {
      code,
      packageId: body.packageId ? String(body.packageId) : null,
      bouquetIds: body.bouquetIds ?? [],
      days: Number(body.days ?? 30),
      maxConnections: Number(body.maxConnections ?? 1),
      maxUses: Number(body.maxUses ?? 1),
      expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
      notes: body.notes ? String(body.notes) : null,
    },
  });
  return NextResponse.json({ code: item });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.accessCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
