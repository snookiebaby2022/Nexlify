import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { parseAvatarConfig } from "@/lib/avatar-config";
import { Prisma } from "@prisma/client";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.panelUser.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarUrl: true,
      avatarConfig: true,
      role: true,
      credits: true,
      totpEnabled: true,
      createdAt: true,
      group: { select: { id: true, name: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: {
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    avatarConfig?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    passwordHash?: string;
  } = {};

  if (body.displayName !== undefined) data.displayName = body.displayName || null;
  if (body.email !== undefined) data.email = body.email || null;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;
  if (body.avatarConfig !== undefined) {
    if (body.avatarConfig === null) {
      data.avatarConfig = Prisma.JsonNull;
    } else {
      const parsed = parseAvatarConfig(body.avatarConfig);
      if (!parsed) return NextResponse.json({ error: "Invalid avatar config" }, { status: 400 });
      data.avatarConfig = parsed as Prisma.InputJsonValue;
    }
  }

  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }
    const existing = await prisma.panelUser.findUnique({ where: { id: session.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ok = await bcrypt.compare(body.currentPassword, existing.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password incorrect" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.newPassword, 10);
  }

  const user = await prisma.panelUser.update({
    where: { id: session.id },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarUrl: true,
      avatarConfig: true,
      role: true,
      credits: true,
    },
  });
  return NextResponse.json({ user });
}
