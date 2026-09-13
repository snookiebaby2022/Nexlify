import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { deleteManagedLines } from "@/lib/line-delete";
import { assertMassDeleteConfirm } from "@/lib/mass-delete-confirm";
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const entity = body.entity as string;
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > 500) {
    return NextResponse.json({ error: "At most 500 ids per request" }, { status: 400 });
  }
  const confirm = assertMassDeleteConfirm({
    entity,
    ids,
    confirmEntity: body.confirmEntity,
    confirmCount: body.confirmCount,
  });
  if (!confirm.ok) {
    return NextResponse.json({ error: confirm.error }, { status: 400 });
  }

  let count = 0;
  if (entity === "streams") {
    const r = await prisma.stream.deleteMany({ where: { id: { in: ids } } });
    count = r.count;
  } else if (entity === "lines") {
    count = await deleteManagedLines(ids);
  } else if (entity === "users") {
    const r = await prisma.panelUser.deleteMany({
      where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
    });
    count = r.count;
  } else if (entity === "bouquets") {
    const r = await prisma.bouquet.deleteMany({ where: { id: { in: ids } } });
    count = r.count;
  } else {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("stats");
  return NextResponse.json({ ok: true, count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
