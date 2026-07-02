import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);
  const lineId = req.nextUrl.searchParams.get("lineId");

  const logs = await prisma.leakAuditLog.findMany({
    where: lineId ? { lineId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs });
}

export async function DELETE() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { getSettingGroup } = await import("@/lib/panel-settings");
  const fp = await getSettingGroup("fingerprint");
  const days = Number(fp.leakAuditRetentionDays ?? 30);
  const cutoff = new Date(Date.now() - days * 86400000);
  const r = await prisma.leakAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return NextResponse.json({ ok: true, deleted: r.count });
}
