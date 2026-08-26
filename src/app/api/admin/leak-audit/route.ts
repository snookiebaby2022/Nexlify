import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseLogLimit } from "@/lib/log-page";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = parseLogLimit(req.nextUrl.searchParams.get("limit"));
  const lineId = req.nextUrl.searchParams.get("lineId");

  const logs = await prisma.leakAuditLog.findMany({
    where: lineId ? { lineId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs });
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (req.nextUrl.searchParams.get("all") === "1") {
    const r = await prisma.leakAuditLog.deleteMany();
    return NextResponse.json({ ok: true, deleted: r.count });
  }

  const { getSettingGroup } = await import("@/lib/panel-settings");
  const fp = await getSettingGroup("fingerprint");
  const days = Number(fp.leakAuditRetentionDays ?? 30);
  const cutoff = new Date(Date.now() - days * 86400000);
  const r = await prisma.leakAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return NextResponse.json({ ok: true, deleted: r.count });
}
