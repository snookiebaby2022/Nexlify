import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const providerId = searchParams.get("providerId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (providerId) where.providerId = providerId;

  const [jobs, total] = await Promise.all([
    prisma.m3uSyncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { provider: { select: { id: true, name: true } } },
    }),
    prisma.m3uSyncJob.count({ where }),
  ]);

  return NextResponse.json({ jobs, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const job = await prisma.m3uSyncJob.create({
    data: {
      name,
      url,
      providerId: body.providerId ? String(body.providerId) : null,
      categoryMap: body.categoryMap ?? null,
      autoAssignEpg: body.autoAssignEpg !== false,
      syncIntervalMins: Number(body.syncIntervalMins ?? 60),
      status: "active",
      nextSyncAt: new Date(Date.now() + Number(body.syncIntervalMins ?? 60) * 60_000),
    },
  });

  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name ? String(body.name) : undefined;
  if (body.url !== undefined) data.url = body.url ? String(body.url) : undefined;
  if (body.providerId !== undefined) data.providerId = body.providerId ? String(body.providerId) : null;
  if (body.categoryMap !== undefined) data.categoryMap = body.categoryMap ?? null;
  if (body.autoAssignEpg !== undefined) data.autoAssignEpg = Boolean(body.autoAssignEpg);
  if (body.syncIntervalMins !== undefined) data.syncIntervalMins = Number(body.syncIntervalMins);
  if (body.status !== undefined) data.status = String(body.status);
  if (body.triggerSync === true) {
    data.lastSyncAt = new Date();
    data.nextSyncAt = new Date(Date.now() + (body.syncIntervalMins ? Number(body.syncIntervalMins) : 60) * 60_000);
  }
  if (body.lastResult !== undefined) data.lastResult = body.lastResult ?? null;

  const job = await prisma.m3uSyncJob.update({ where: { id }, data });
  return NextResponse.json({ job });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.m3uSyncJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
