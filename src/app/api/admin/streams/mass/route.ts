import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole, StreamType, type Prisma } from "@prisma/client";
import { expandCategoryFilter } from "@/lib/category-tree";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const FILTER_ACTIONS = new Set(["setHostedProvider", "clearHostedProvider", "fillPosters"]);

async function whereFromMassFilter(
  filter: Record<string, unknown>
): Promise<{ where: Prisma.StreamWhereInput } | { error: string }> {
  const type = String(filter.type ?? "");
  if (!Object.values(StreamType).includes(type as StreamType)) {
    return { error: "filter.type required (LIVE, MOVIE, or SERIES)" };
  }

  const where: Prisma.StreamWhereInput = { type: type as StreamType };

  if (filter.radio === true || filter.radio === "1") {
    where.isRadio = true;
    where.type = StreamType.LIVE;
  }

  const episodesOnly = filter.episodesOnly === true || filter.episodesOnly === "1";
  const seriesSeedsOnly = filter.seriesSeedsOnly === true || filter.seriesSeedsOnly === "1";
  if (episodesOnly) {
    where.type = StreamType.SERIES;
    where.AND = [
      {
        OR: [{ episodeNum: { not: null, gt: 0 } }, { name: { contains: "E", mode: "insensitive" } }],
      },
    ];
  } else if (seriesSeedsOnly) {
    where.type = StreamType.SERIES;
    where.AND = [{ OR: [{ episodeNum: null }, { episodeNum: 0 }] }];
  }

  const categoryId = String(filter.categoryId ?? "").trim();
  if (categoryId) {
    if (categoryId === "0" || categoryId.toLowerCase() === "uncategorized") {
      where.categoryId = null;
    } else {
      where.categoryId = { in: await expandCategoryFilter(categoryId) };
    }
  }

  const bouquetId = String(filter.bouquetId ?? "").trim();
  if (bouquetId) where.bouquets = { some: { bouquetId } };

  const status = String(filter.status ?? "").toLowerCase();
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;

  const search = String(filter.search ?? "").trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { streamUrl: { contains: search, mode: "insensitive" } },
      { seriesName: { contains: search, mode: "insensitive" } },
    ];
  }

  return { where };
}

function parseSpeedInput(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function parseBouquetIds(body: Record<string, unknown>): string[] {
  const raw = body.bouquetIds ?? body.bouquetId;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as Record<string, unknown>;
    const ids: string[] = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).filter(Boolean) : [];
    const action = String(body.action ?? "");
    const filter =
      body.filter && typeof body.filter === "object" && !Array.isArray(body.filter)
        ? (body.filter as Record<string, unknown>)
        : null;

    let where: Prisma.StreamWhereInput;
    if (ids.length) {
      where = { id: { in: ids } };
    } else if (filter && FILTER_ACTIONS.has(action)) {
      const scoped = await whereFromMassFilter(filter);
      if ("error" in scoped) return NextResponse.json({ error: scoped.error }, { status: 400 });
      where = scoped.where;
    } else {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    if (body.preview === true) {
      if (!FILTER_ACTIONS.has(action)) {
        return NextResponse.json({ error: "preview is only for hosted-provider actions" }, { status: 400 });
      }
      const countWhere =
        action === "fillPosters"
          ? { AND: [where, { OR: [{ streamIcon: null }, { streamIcon: "" }] }] }
          : where;
      const count = await prisma.stream.count({ where: countWhere });
      return NextResponse.json({ ok: true, count });
    }

    let count = 0;
    const counted = async (result: { count: number }) => {
      count = result.count;
    };

    if (action === "enable") {
      await counted(await prisma.stream.updateMany({ where, data: { isActive: true } }));
    } else if (action === "disable") {
      await counted(await prisma.stream.updateMany({ where, data: { isActive: false } }));
    } else if (action === "delete") {
      if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
      await counted(await prisma.stream.deleteMany({ where: { id: { in: ids } } }));
    } else if (action === "setCategory" && body.categoryId !== undefined) {
      await counted(
        await prisma.stream.updateMany({
          where,
          data: { categoryId: body.categoryId ? String(body.categoryId) : null },
        })
      );
      await invalidateXtreamCategories();
    } else if (action === "clearCategory") {
      await counted(await prisma.stream.updateMany({ where, data: { categoryId: null } }));
      await invalidateXtreamCategories();
    } else if (action === "setServer" && body.serverId !== undefined) {
      await counted(
        await prisma.stream.updateMany({
          where,
          data: { serverId: body.serverId ? String(body.serverId) : null },
        })
      );
    } else if (action === "setAdult" && body.isAdult !== undefined) {
      await counted(await prisma.stream.updateMany({ where, data: { isAdult: Boolean(body.isAdult) } }));
    } else if (action === "setContainerExtension" && body.containerExtension !== undefined) {
      const ext = body.containerExtension ? String(body.containerExtension).replace(/^\./, "") : "mp4";
      await counted(
        await prisma.stream.updateMany({
          where,
          data: { containerExtension: ext || "mp4" },
        })
      );
    } else if (action === "setSeriesName" && body.seriesName !== undefined) {
      await counted(
        await prisma.stream.updateMany({
          where,
          data: { seriesName: body.seriesName ? String(body.seriesName).trim() : null },
        })
      );
    } else if (action === "setHostedProvider") {
      const providerId = String(body.providerId ?? "").trim();
      if (providerId) {
        const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
        if (!provider) return NextResponse.json({ error: "Selected provider not found" }, { status: 400 });
        if (!provider.isActive) return NextResponse.json({ error: "Selected provider is disabled" }, { status: 400 });
      }
      await counted(
        await prisma.stream.updateMany({
          where,
          data: {
            hostedExternally: true,
            ...(providerId ? { providerId } : {}),
          },
        })
      );
    } else if (action === "fillPosters") {
      const { fillMissingStreamArtwork } = await import("@/lib/artwork-fill");
      const result = await fillMissingStreamArtwork({
        where,
        tmdbLimit: Math.min(2000, Math.max(0, Number(body.tmdbLimit ?? 400) || 400)),
        liveLogoLimit: 40,
      });
      count = result.updated;
    } else if (action === "clearHostedProvider") {
      await counted(
        await prisma.stream.updateMany({
          where,
          data: { hostedExternally: false, providerId: null, providerPath: null },
        })
      );
    } else if (action === "addToBouquet") {
      const bouquetIds = parseBouquetIds(body);
      if (!bouquetIds.length) {
        return NextResponse.json({ error: "bouquetIds required" }, { status: 400 });
      }
      if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
      const existing = await prisma.bouquetStream.findMany({
        where: { streamId: { in: ids }, bouquetId: { in: bouquetIds } },
        select: { streamId: true, bouquetId: true },
      });
      const have = new Set(existing.map((r) => `${r.streamId}:${r.bouquetId}`));
      const data = ids.flatMap((streamId) =>
        bouquetIds
          .filter((bouquetId) => !have.has(`${streamId}:${bouquetId}`))
          .map((bouquetId) => ({ streamId, bouquetId, sortOrder: 0 }))
      );
      if (data.length) {
        await prisma.bouquetStream.createMany({ data, skipDuplicates: true });
      }
      count = ids.length;
    } else if (action === "removeFromBouquet") {
      const bouquetIds = parseBouquetIds(body);
      if (!bouquetIds.length) {
        return NextResponse.json({ error: "bouquetIds required" }, { status: 400 });
      }
      if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
      await prisma.bouquetStream.deleteMany({
        where: { streamId: { in: ids }, bouquetId: { in: bouquetIds } },
      });
      count = ids.length;
    } else if (action === "setVodMode" && body.vodMode !== undefined) {
      const mode = String(body.vodMode);
      if (!["LIVE", "ON_DEMAND", "CATCHUP"].includes(mode)) {
        return NextResponse.json({ error: "Invalid vodMode" }, { status: 400 });
      }
      await counted(
        await prisma.stream.updateMany({
          where,
          data: {
            vodMode: mode as "LIVE" | "ON_DEMAND" | "CATCHUP",
            isOnDemand: mode !== "LIVE",
            archiveDays:
              body.archiveDays !== undefined && body.archiveDays !== ""
                ? Number(body.archiveDays)
                : undefined,
          },
        })
      );
    } else if (action === "setSpeed") {
      const minSpeedKbps = parseSpeedInput(body.minSpeedKbps);
      const maxSpeedKbps = parseSpeedInput(body.maxSpeedKbps);
      if (minSpeedKbps === undefined && maxSpeedKbps === undefined) {
        return NextResponse.json({ error: "Provide min and/or max speed (Kbps)" }, { status: 400 });
      }
      if (minSpeedKbps != null && maxSpeedKbps != null && minSpeedKbps > maxSpeedKbps) {
        return NextResponse.json(
          { error: "Min speed cannot be greater than max speed" },
          { status: 400 }
        );
      }
      const data: { minSpeedKbps?: number | null; maxSpeedKbps?: number | null } = {};
      if (minSpeedKbps !== undefined) data.minSpeedKbps = minSpeedKbps;
      if (maxSpeedKbps !== undefined) data.maxSpeedKbps = maxSpeedKbps;

      const existing = await prisma.stream.findMany({
        where,
        select: { minSpeedKbps: true, maxSpeedKbps: true },
      });
      for (const row of existing) {
        const nextMin = data.minSpeedKbps !== undefined ? data.minSpeedKbps : row.minSpeedKbps;
        const nextMax = data.maxSpeedKbps !== undefined ? data.maxSpeedKbps : row.maxSpeedKbps;
        if (nextMin != null && nextMax != null && nextMin > nextMax) {
          return NextResponse.json(
            { error: "Min speed cannot be greater than max speed for selected streams" },
            { status: 400 }
          );
        }
      }

      await counted(await prisma.stream.updateMany({ where, data }));
    } else if (action === "setBackupUrl") {
      const backupUrl =
        body.backupUrl === null || body.backupUrl === ""
          ? null
          : String(body.backupUrl).trim() || null;
      await counted(await prisma.stream.updateMany({ where, data: { backupUrl } }));
    } else if (action === "clearBackupUrl") {
      await counted(await prisma.stream.updateMany({ where, data: { backupUrl: null } }));
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await logActivity("mass_streams", {
      userId: session.id,
      entity: "stream",
      meta: { action, count },
    });

    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
