import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { canAccessBouquet, canManageBouquet } from "@/lib/bouquet-access";
import {
  bouquetContentCountsByBouquetId,
  emptyBouquetContentCounts,
} from "@/lib/bouquet-counts";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole, Prisma } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

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
      select: {
        id: true,
        name: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { lines: true, streams: true } },
      },
    });
    if (!bouquet) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canAccessBouquet(session, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const memberRows = await prisma.bouquetStream.findMany({
      where: { bouquetId: id },
      select: { streamId: true },
      orderBy: { sortOrder: "asc" },
    });
    const streamIds = memberRows.map((r) => r.streamId);
    const previewIds = streamIds.slice(0, 50);
    const previewStreams = previewIds.length
      ? await prisma.stream.findMany({
          where: { id: { in: previewIds } },
          select: {
            id: true,
            name: true,
            type: true,
            isRadio: true,
            category: { select: { name: true } },
          },
        })
      : [];
    const previewMap = new Map(previewStreams.map((s) => [s.id, s]));
    const countMap = await bouquetContentCountsByBouquetId(prisma, [id]);

    return NextResponse.json({
      bouquet: {
        ...bouquet,
        streams: [] as unknown[],
        contentCounts: countMap.get(id) ?? emptyBouquetContentCounts(),
      },
      streamIds,
      items: previewIds.map((sid) => {
        const s = previewMap.get(sid);
        return {
          id: sid,
          label: s?.name ?? `Stream ${sid.slice(0, 8)}…`,
          sublabel: s?.isRadio ? "LIVE" : (s?.type ?? "LIVE"),
          group: s?.category?.name,
        };
      }),
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
    ownerUserId: b.ownerUserId ?? null,
    streams: [] as { stream: { type: string } }[],
    contentCounts: countMap.get(b.id) ?? emptyBouquetContentCounts(),
  }));

  return NextResponse.json({ bouquets: withCounts });
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.order && Array.isArray(body.order) && session.role === PanelRole.ADMIN) {
    const ids: string[] = body.order;
    await Promise.all(
      ids.map((id, i) => prisma.bouquet.update({ where: { id }, data: { sortOrder: i } }))
    );
    return NextResponse.json({ ok: true });
  }

  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (!(await canManageBouquet(session, id))) {
    return NextResponse.json({ error: "You can only edit bouquets you created" }, { status: 403 });
  }

  if (Array.isArray(body.streamIds)) {
    let streamIds: string[] = body.streamIds;
    if (session.role !== PanelRole.ADMIN) {
      const { getResellerBouquetIds } = await import("@/lib/reseller-bouquet-scope");
      const allowedBouquets = await getResellerBouquetIds(session);
      if (!allowedBouquets?.length) {
        return NextResponse.json({ error: "No bouquet access" }, { status: 403 });
      }
      const allowedRows = await prisma.bouquetStream.findMany({
        where: { bouquetId: { in: allowedBouquets } },
        select: { streamId: true },
      });
      const allowedSet = new Set(allowedRows.map((r) => r.streamId));
      if (streamIds.some((sid) => !allowedSet.has(sid))) {
        return NextResponse.json({ error: "Some streams are outside your bouquet scope" }, { status: 403 });
      }
    }
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
    select: { id: true, name: true, isActive: true, sortOrder: true },
  });

  const streamCount = Array.isArray(body.streamIds)
    ? (body.streamIds as string[]).length
    : await prisma.bouquetStream.count({ where: { bouquetId: id } });

  await logActivity("edit_bouquet", {
    userId: session.id,
    entity: "bouquet",
    entityId: id,
    meta: { streamCount },
  });

  await invalidateXtreamCategories();

  return NextResponse.json({
    bouquet,
    streamIds: Array.isArray(body.streamIds) ? body.streamIds : undefined,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
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
    if (!(await canAccessBouquet(session, source.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bouquet = await prisma.bouquet.create({
      data: {
        name: String(body.name ?? `${source.name} (Copy)`),
        ownerUserId: session.role === PanelRole.ADMIN ? null : session.id,
        streams: {
          create: source.streams.map((bs) => ({
            streamId: bs.streamId,
            sortOrder: bs.sortOrder,
          })),
        },
      },
      include: { streams: { select: { streamId: true } } },
    });

    if (session.role !== PanelRole.ADMIN) {
      await prisma.resellerBouquet.create({
        data: { userId: session.id, bouquetId: bouquet.id },
      });
    }

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
  if (session.role !== PanelRole.ADMIN && streamIds.length) {
    const { getResellerBouquetIds } = await import("@/lib/reseller-bouquet-scope");
    const allowedBouquets = await getResellerBouquetIds(session);
    if (!allowedBouquets?.length) {
      return NextResponse.json({ error: "No bouquet access" }, { status: 403 });
    }
    const allowedRows = await prisma.bouquetStream.findMany({
      where: { bouquetId: { in: allowedBouquets } },
      select: { streamId: true },
    });
    const allowedSet = new Set(allowedRows.map((r) => r.streamId));
    if (streamIds.some((sid) => !allowedSet.has(sid))) {
      return NextResponse.json({ error: "Some streams are outside your bouquet scope" }, { status: 403 });
    }
  }

  const bouquet = await prisma.bouquet.create({
    data: {
      name: body.name,
      ownerUserId: session.role === PanelRole.ADMIN ? null : session.id,
      streams: {
        create: streamIds.map((streamId: string, i: number) => ({
          streamId,
          sortOrder: i,
        })),
      },
    },
    include: { streams: { select: { streamId: true } } },
  });

  if (session.role !== PanelRole.ADMIN) {
    await prisma.resellerBouquet.create({
      data: { userId: session.id, bouquetId: bouquet.id },
    });
  }

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
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.bouquet.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await canManageBouquet(session, id))) {
    return NextResponse.json({ error: "You can only delete bouquets you created" }, { status: 403 });
  }

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
