import { NextRequest, NextResponse } from "next/server";
import { requireSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

function roleLabel(role: PanelRole) {
  if (role === PanelRole.ADMIN) return "admin";
  if (role === PanelRole.SUB_RESELLER) return "sub-reseller";
  return "reseller";
}

function serializeUser(
  u: {
    id: string;
    username: string;
    email: string | null;
    role: PanelRole;
    isActive: boolean;
    credits: number;
    notes: string | null;
    updatedAt: Date;
    parent: { username: string } | null;
    group: { id: string; name: string } | null;
    _count: { lines: number };
  },
  displayId: number
) {
  return {
    id: u.id,
    displayId,
    username: u.username,
    email: u.email ?? "",
    role: u.role,
    roleLabel: roleLabel(u.role),
    isActive: u.isActive,
    credits: u.credits,
    notes: u.notes ?? "",
    owner: u.parent?.username ?? null,
    groupId: u.group?.id ?? null,
    groupName: u.group?.name ?? roleLabel(u.role),
    lines: u._count.lines,
    lastLogin: u.updatedAt.toISOString(),
    ip: null as string | null,
  };
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.panelUser.findMany({
    include: {
      _count: { select: { lines: true, children: true } },
      resellerBouquets: { include: { bouquet: true } },
      group: { select: { id: true, name: true } },
      parent: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const users = rows.map((r, i) => serializeUser(r, i + 1));
  const resellers = users.filter((u) => u.role !== PanelRole.ADMIN);

  return NextResponse.json({ users, resellers });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: {
    isActive?: boolean;
    notes?: string | null;
    credits?: number;
  } = {};
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
  if (body.credits != null) data.credits = Number(body.credits);

  const user = await prisma.panelUser.update({
    where: { id },
    data,
  });

  return NextResponse.json({ user: { id: user.id, username: user.username } });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === session.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const lines = await prisma.line.count({ where: { ownerId: id } });
  const children = await prisma.panelUser.count({ where: { parentId: id } });
  if (children > 0) {
    return NextResponse.json({ error: "User has sub-resellers — remove or reassign them first" }, { status: 400 });
  }
  if (lines > 0) {
    return NextResponse.json({ error: "User has lines — reassign or delete lines first" }, { status: 400 });
  }

  await prisma.panelUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const password = body.password || Math.random().toString(36).slice(2, 10);

  const role =
    body.role === "SUB_RESELLER" ? PanelRole.SUB_RESELLER : PanelRole.RESELLER;

  const parentId =
    body.parentId && String(body.parentId).trim()
      ? String(body.parentId)
      : role === PanelRole.SUB_RESELLER
        ? null
        : session.id;

  if (role === PanelRole.SUB_RESELLER && !parentId) {
    return NextResponse.json({ error: "Sub-reseller requires a parent user" }, { status: 400 });
  }

  const reseller = await prisma.panelUser.create({
    data: {
      username: String(body.username).trim(),
      passwordHash: await hashPassword(password),
      role,
      email: body.email ? String(body.email) : null,
      isActive: body.isActive !== false,
      defaultLanguage: body.defaultLanguage ? String(body.defaultLanguage) : "en",
      groupId: body.groupId ? String(body.groupId) : null,
      credits: Number(body.credits ?? 0),
      maxLines: Number(body.maxLines ?? 500),
      parentId,
      resellerDns: body.resellerDns ? String(body.resellerDns) : null,
      notes: body.notes ? String(body.notes) : null,
      resellerBouquets: {
        create: (body.bouquetIds ?? []).map((bouquetId: string) => ({ bouquetId })),
      },
    },
  });

  return NextResponse.json({ reseller: { id: reseller.id, username: reseller.username }, password });
}
