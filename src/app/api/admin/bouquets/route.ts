import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const bouquet = await prisma.bouquet.findUnique({
      where: { id },
      include: {
        streams: {
          orderBy: { sortOrder: "asc" },
          include: {
            stream: { include: { category: { select: { name: true } } } },
          },
        },
        _count: { select: { lines: true } },
      },
    });
    if (!bouquet) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      bouquet,
      streamIds: bouquet.streams.sort((a, b) => a.sortOrder - b.sortOrder).map((bs) => bs.streamId),
    });
  }

  const where: Prisma.BouquetWhereInput =
    session.role === PanelRole.ADMIN
      ? {}
      : { resellerBouquets: { some: { userId: session.id } } };

  const bouquets = await prisma.bouquet.findMany({
    where,
    include: {
      streams: { include: { stream: true } },
      _count: { select: { lines: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ bouquets });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (body.order && Array.isArray(body.order)) {
    const ids: string[] = body.order;
    await Promise.all(
      ids.map((id, i) => prisma.bouquet.update({ where: { id }, data: { sortOrder: i } }))
    );
    return NextResponse.json({ ok: true });
  }

  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (Array.isArray(body.streamIds)) {
    const streamIds: string[] = body.streamIds;
    await prisma.bouquetStream.deleteMany({ where: { bouquetId: id } });
    if (streamIds.length) {
      await prisma.bouquetStream.createMany({
        data: streamIds.map((streamId, i) => ({ bouquetId: id, streamId, sortOrder: i })),
        skipDuplicates: true,
      });
    }
  }

  const bouquet = await prisma.bouquet.update({
    where: { id },
    data: {
      name: body.name,
      isActive: body.isActive,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    },
    include: {
      streams: { include: { stream: true } },
      _count: { select: { lines: true } },
    },
  });

  await logActivity("edit_bouquet", {
    userId: session.id,
    entity: "bouquet",
    entityId: id,
    meta: { streamCount: bouquet.streams.length },
  });

  return NextResponse.json({
    bouquet,
    streamIds: bouquet.streams.map((bs) => bs.streamId),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const streamIds: string[] = body.streamIds ?? [];

  const bouquet = await prisma.bouquet.create({
    data: {
      name: body.name,
      streams: {
        create: streamIds.map((streamId: string, i: number) => ({
          streamId,
          sortOrder: i,
        })),
      },
    },
    include: { streams: { include: { stream: true } } },
  });

  await logActivity("create_bouquet", {
    userId: session.id,
    entity: "bouquet",
    entityId: bouquet.id,
    meta: { streamCount: streamIds.length },
  });

  return NextResponse.json({ bouquet });
}
