import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const line = await prisma.line.findFirst({
    where,
    include: {
      bouquets: { include: { bouquet: true } },
      owner: { select: { id: true, username: true } },
      forcedServer: { select: { id: true, name: true } },
    },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ line });
}

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
    allowedUserAgents:
      body.allowedUserAgents !== undefined
        ? body.allowedUserAgents
          ? String(body.allowedUserAgents)
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
    isRestreamer: body.isRestreamer !== undefined ? Boolean(body.isRestreamer) : undefined,
    isTrial: body.isTrial !== undefined ? Boolean(body.isTrial) : undefined,
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
    await invalidateXtreamCategories();
  }

  await logActivity("edit_line", {
    userId: session.id,
    lineId: line.id,
    entity: "line",
    entityId: line.id,
  });

  return NextResponse.json({ line });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const existing = await prisma.line.findFirst({ where });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.line.delete({ where: { id: existing.id } });

  await logActivity("delete_line", {
    userId: session.id,
    lineId: existing.id,
    entity: "line",
    entityId: existing.id,
    meta: { username: existing.username },
  });

  return NextResponse.json({ ok: true });
}
