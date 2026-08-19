import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { LineStatus, PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const line = await prisma.line.findUnique({ where: { id } });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role !== PanelRole.ADMIN && line.ownerId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { status } = parsed.data;

  if (!["ACTIVE", "DISABLED", "BANNED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.line.update({
    where: { id },
    data: { status: status as LineStatus },
    include: { bouquets: { include: { bouquet: true } } },
  });

  await logActivity(`line_${status.toLowerCase()}`, {
    userId: session.id,
    lineId: id,
  });

  return NextResponse.json({ line: updated });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
