import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();

  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const existing = await prisma.line.findFirst({ where });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {
    lockToIp: body.lockToIp !== undefined ? Boolean(body.lockToIp) : undefined,
    allowedIps:
      body.allowedIps !== undefined
        ? body.allowedIps
          ? String(body.allowedIps)
          : null
        : undefined,
    allowedCountries:
      body.allowedCountries !== undefined
        ? body.allowedCountries
          ? String(body.allowedCountries)
          : null
        : undefined,
    blockedCountries:
      body.blockedCountries !== undefined
        ? body.blockedCountries
          ? String(body.blockedCountries)
          : null
        : undefined,
    forcedServerId:
      body.forcedServerId !== undefined
        ? body.forcedServerId
          ? String(body.forcedServerId)
          : null
        : undefined,
    maxConnections:
      body.maxConnections != null ? Number(body.maxConnections) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
    password: body.password ? String(body.password) : undefined,
    externalId:
      body.externalId !== undefined ? (body.externalId ? String(body.externalId) : null) : undefined,
  };

  if (body.days && Number(body.days) > 0) {
    const expiresAt = new Date(
      existing.expiresAt > new Date() ? existing.expiresAt : new Date()
    );
    expiresAt.setDate(expiresAt.getDate() + Number(body.days));
    data.expiresAt = expiresAt;
  }

  const line = await prisma.line.update({
    where: { id: existing.id },
    data,
  });

  if (body.bouquetIds && Array.isArray(body.bouquetIds)) {
    await prisma.lineBouquet.deleteMany({ where: { lineId: line.id } });
    await prisma.lineBouquet.createMany({
      data: body.bouquetIds.map((bouquetId: string) => ({ lineId: line.id, bouquetId })),
    });
  }

  await logActivity("edit_line", {
    userId: session.id,
    lineId: line.id,
    entity: "line",
    entityId: line.id,
  });

  return NextResponse.json({ line });
}
