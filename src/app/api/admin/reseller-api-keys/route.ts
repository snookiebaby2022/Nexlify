import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { randomBytes } from "crypto";

function generateKey(): string {
  return `nk_${randomBytes(24).toString("hex")}`;
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const userId = searchParams.get("userId");
  const isActive = searchParams.get("isActive");

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (isActive !== null) where.isActive = isActive === "true";

  const keys = await prisma.resellerApiKey.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const userId = String(body.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const key = generateKey();
  const item = await prisma.resellerApiKey.create({
    data: {
      userId,
      key,
      label: body.label ? String(body.label) : null,
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      allowedIps: Array.isArray(body.allowedIps) ? body.allowedIps.map(String) : [],
      expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
      isActive: true,
    },
  });

  return NextResponse.json({ key: item });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.resellerApiKey.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
