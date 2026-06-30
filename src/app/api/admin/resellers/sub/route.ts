import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.panelUser.findMany({
    where: { role: PanelRole.SUB_RESELLER },
    include: {
      parent: { select: { id: true, username: true } },
      group: { select: { id: true, name: true } },
      _count: { select: { lines: true, children: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const resellers = rows.map((r, i) => ({
    id: r.id,
    displayId: i + 1,
    username: r.username,
    email: r.email ?? "",
    isActive: r.isActive,
    credits: r.credits,
    maxLines: r.maxLines,
    notes: r.notes ?? "",
    lines: r._count.lines,
    subUsers: r._count.children,
    parentId: r.parent?.id ?? null,
    parentUsername: r.parent?.username ?? null,
    groupId: r.group?.id ?? null,
    groupName: r.group?.name ?? "sub-reseller",
    createdAt: r.createdAt.toISOString(),
    lastLogin: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({ resellers });
}
