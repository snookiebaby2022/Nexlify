import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { canAccessBouquet } from "@/lib/bouquet-access";
import {
  bouquetContentCounts,
  bouquetContentCountsByBouquetId,
  emptyBouquetContentCounts,
} from "@/lib/bouquet-counts";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { redactStream } from "@/lib/stream-redact";
import { PanelRole, Prisma } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
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
    if (!(await canAccessBouquet(session, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const safeBouquet = {
      ...bouquet,
      streams: bouquet.streams.map((bs) => ({
        ...bs,
        stream: redactStream(bs.stream, session.role),
      })),
    };
    return NextResponse.json({
      bouquet: {
        ...safeBouquet,
        contentCounts: bouquetContentCounts(bouquet.streams),
      },
      streamIds: bouquet.streams.sort((a, b) => a.sortOrder - b.sortOrder).map((bs) => bs.streamId),
    });
  }

  const where: Prisma.BouquetWhereInput =
    session.role === PanelRole.ADMIN
      ? {}
      : { resellerBouquets: { some: { userId: session.id } } };

  // List view must NOT include every BouquetStream row — on large panels that is
  // 100k+ joins / ~18MB JSON and the Manage Bouquets page shows "No bouquets found".
  const bouquets = await prisma.bouquet.findMany({
    where,
    include: {
      _count: { select: { lines: true, streams: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const countMap = await bouquetContentCountsByBouquetId(
    prisma,
    bouquets.map((b) => b.id)
  );

  const withCounts = bouquets.map((b) => ({
    ...b,
    // Keep a tiny streams stub so older clients reading streams.length still work.
    streams: [] as { stream: { type: string } }[],
    contentCounts: countMap.get(b.id) ?? emptyBouquetContentCounts(),
  }));

  return NextResponse.json({ bouquets: withCounts });
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

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

  await invalidateXtreamCategories();

  return NextResponse.json({
    bouquet,
    streamIds: bouquet.streams.map((bs) => bs.streamId),
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.duplicateOf) {
    const source = await prisma.bouquet.findUnique({
      where: { id: body.duplicateOf },
      include: { streams: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return NextResponse.json({ error: "Source bouquet not found" }, { status: 404 });

    const bouquet = await prisma.bouquet.create({
      data: {
        name: source.name + " (Copy)",
        streams: {
          create: source.streams.map((bs) => ({
            streamId: bs.streamId,
            sortOrder: bs.sortOrder,
          })),
        },
      },
      include: { streams: { include: { stream: true } } },
    });

    await logActivity("duplicate_bouquet", {
      userId: session.id,
      entity: "bouquet",
      entityId: bouquet.id,
      meta: { sourceId: source.id, sourceName: source.name, streamCount: source.streams.length },
    });

    await invalidateXtreamCategories();

    return NextResponse.json({ bouquet });
  }

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

  await invalidateXtreamCategories();

  return NextResponse.json({ bouquet });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.bouquet.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.bouquet.delete({ where: { id } });

  await logActivity("delete_bouquet", {
    userId: session.id,
    entity: "bouquet",
    entityId: id,
    meta: { name: existing.name },
  });

  await invalidateXtreamCategories();

  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
