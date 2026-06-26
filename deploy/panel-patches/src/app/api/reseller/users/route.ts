import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { canManageSubUsers, directSubUserWhere } from "@/lib/reseller-sub-users";

function roleLabel(role: PanelRole) {
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
    createdAt: Date;
    updatedAt: Date;
    parent: { username: string } | null;
    group: { id: string; name: string } | null;
    _count: { lines: number; children: number };
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
    subUsers: u._count.children,
    createdAt: u.createdAt.toISOString(),
    lastLogin: u.updatedAt.toISOString(),
    ip: null as string | null,
  };
}

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.panelUser.findMany({
    where: directSubUserWhere(session.id),
    include: {
      _count: { select: { lines: true, children: true } },
      group: { select: { id: true, name: true } },
      parent: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = rows.map((r, i) => serializeUser(r, rows.length - i));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session || !canManageSubUsers(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const parent = await prisma.panelUser.findUnique({
    where: { id: session.id },
    select: { credits: true, groupId: true },
  });
  if (!parent) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credits = Math.max(0, Math.min(Number(body.credits ?? 0), parent.credits));
  if (credits > parent.credits) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
  }

  const existing = await prisma.panelUser.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 400 });
  }

  const groupId = body.groupId ? String(body.groupId) : parent.groupId;

  const user = await prisma.$transaction(async (tx) => {
    if (credits > 0) {
      const afterParent = await tx.panelUser.update({
        where: { id: session.id },
        data: { credits: { decrement: credits } },
      });
      await tx.creditTransaction.create({
        data: {
          userId: session.id,
          amount: -credits,
          balanceAfter: afterParent.credits,
          note: `Allocated to sub-reseller ${username}`,
        },
      });
    }
    const created = await tx.panelUser.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        email: body.email ? String(body.email).trim() : null,
        role: PanelRole.SUB_RESELLER,
        parentId: session.id,
        groupId,
        credits,
        isActive: body.isActive !== false,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    if (credits > 0) {
      await tx.creditTransaction.create({
        data: {
          userId: created.id,
          amount: credits,
          balanceAfter: credits,
          note: "Initial credits from parent",
        },
      });
    }
    return created;
  });

  return NextResponse.json({ user: { id: user.id, username: user.username } });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const child = await prisma.panelUser.findFirst({
    where: { id, ...directSubUserWhere(session.id) },
  });
  if (!child) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: { isActive?: boolean; notes?: string | null; email?: string | null } = {};
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;

  const user = await prisma.panelUser.update({ where: { id }, data });
  return NextResponse.json({ user: { id: user.id, username: user.username, isActive: user.isActive } });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const child = await prisma.panelUser.findFirst({
    where: { id, ...directSubUserWhere(session.id) },
    include: { _count: { select: { lines: true, children: true } } },
  });
  if (!child) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (child._count.lines > 0) {
    return NextResponse.json({ error: "User still has lines — remove lines first" }, { status: 400 });
  }
  if (child._count.children > 0) {
    return NextResponse.json({ error: "User still has sub-users — remove them first" }, { status: 400 });
  }

  await prisma.panelUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
