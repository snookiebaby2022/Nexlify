import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { logActivity } from "@/lib/lines";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.line.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await logActivity("clear_expired_lines", {
    userId: session.id,
    entity: "line",
    meta: { deleted: result.count },
  });
  return NextResponse.json({ ok: true, deleted: result.count });
}
