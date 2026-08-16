import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType, type Prisma } from "@prisma/client";
import { syncStreamBouquets } from "@/lib/stream-bouquets";
import {
  invalidateDashboardStats,
  invalidatePlaybackUrls,
  invalidateXtreamCategories,
} from "@/lib/cache-invalidate";
import { resolveProviderUrl } from "@/lib/vod-provider-url";
import { normalizeStreamSource } from "@/lib/stream-source";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const seriesId = req.nextUrl.searchParams.get("seriesId")?.trim();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const where: Prisma.StreamWhereInput = { type: StreamType.SERIES };

  if (seriesId) {
    const parent = await prisma.stream.findUnique({ where: { id: seriesId } });
    if (!parent) return NextResponse.json({ episodes: [], total: 0, page, pageSize });
    const seriesName = parent.seriesName ?? parent.name;
    where.seriesName = seriesName;
  }

  const [total, rows] = await Promise.all([
    prisma.stream.count({ where }),
    prisma.stream.findMany({
      where,
      orderBy: [{ seasonNum: "asc" }, { episodeNum: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        streamUrl: true,
        seasonNum: true,
        episodeNum: true,
        seriesName: true,
        isActive: true,
        hostedExternally: true,
        providerId: true,
      },
    }),
  ]);

  const episodes = rows.map((r) => ({
    id: r.id,
    title: r.name,
    season: r.seasonNum ?? 1,
    episode: r.episodeNum ?? 1,
    streamUrl: r.streamUrl,
    isActive: r.isActive !== false,
    hostedExternally: Boolean(r.hostedExternally),
    series: {
      id: seriesId ?? r.id,
      name: r.seriesName ?? r.name,
    },
  }));

  return NextResponse.json({
    episodes,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function resolveEpisodeSource(body: {
  streamUrl?: unknown;
  hostedExternally?: unknown;
  providerId?: unknown;
  providerPath?: unknown;
}): Promise<
  | { ok: true; streamUrl: string; hostedExternally: boolean; providerId: string | null; providerPath: string | null }
  | { ok: false; error: string }
> {
  const useProvider =
    body.hostedExternally === true ||
    (Boolean(body.providerId) && Boolean(String(body.providerPath ?? "").trim()));

  if (useProvider) {
    const providerId = String(body.providerId ?? "").trim();
    const providerPath = String(body.providerPath ?? "").trim();
    if (!providerId || !providerPath) {
      return { ok: false, error: "providerId and providerPath required for hosted episode" };
    }
    const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
    if (!provider) return { ok: false, error: "Selected provider not found" };
    if (!provider.isActive) return { ok: false, error: "Selected provider is disabled" };
    return {
      ok: true,
      streamUrl: resolveProviderUrl(provider, providerPath),
      hostedExternally: true,
      providerId,
      providerPath,
    };
  }

  const streamUrl = normalizeStreamSource(String(body.streamUrl ?? ""));
  if (!streamUrl) return { ok: false, error: "streamUrl is required" };
  return {
    ok: true,
    streamUrl,
    hostedExternally: false,
    providerId: null,
    providerPath: null,
  };
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const seriesId = String(body.seriesId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const season = Math.max(1, parseInt(String(body.season ?? body.seasonNum ?? 1), 10) || 1);
  const episode = Math.max(1, parseInt(String(body.episode ?? body.episodeNum ?? 1), 10) || 1);
  const bouquetIds: string[] = Array.isArray(body.bouquetIds) ? body.bouquetIds : [];

  if (!seriesId || !title) {
    return NextResponse.json({ error: "seriesId and title are required" }, { status: 400 });
  }

  const source = await resolveEpisodeSource(body);
  if (!source.ok) return NextResponse.json({ error: source.error }, { status: 400 });

  const parent = await prisma.stream.findUnique({ where: { id: seriesId } });
  if (!parent || parent.type !== StreamType.SERIES) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const seriesName = parent.seriesName ?? parent.name;

  const stream = await prisma.stream.create({
    data: {
      name: title,
      streamUrl: source.streamUrl,
      type: StreamType.SERIES,
      seriesName,
      seasonNum: season,
      episodeNum: episode,
      categoryId: parent.categoryId,
      serverId: parent.serverId,
      streamIcon: parent.streamIcon,
      isOnDemand: true,
      vodMode: "ON_DEMAND",
      containerExtension: "mp4",
      hostedExternally: source.hostedExternally,
      providerId: source.providerId,
      providerPath: source.providerPath,
    },
  });

  await syncStreamBouquets(stream.id, bouquetIds);
  await invalidateXtreamCategories();
  await invalidateDashboardStats();

  return NextResponse.json({
    episode: {
      id: stream.id,
      title: stream.name,
      season,
      episode,
      streamUrl: stream.streamUrl,
      series: { id: parent.id, name: seriesName },
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.stream.findUnique({ where: { id } });
  if (!existing || existing.type !== StreamType.SERIES) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const data: Prisma.StreamUpdateInput = {};
  if (body.title != null || body.name != null) data.name = String(body.title ?? body.name).trim();
  if (body.season != null || body.seasonNum != null) {
    data.seasonNum = Math.max(1, parseInt(String(body.season ?? body.seasonNum), 10) || 1);
  }
  if (body.episode != null || body.episodeNum != null) {
    data.episodeNum = Math.max(1, parseInt(String(body.episode ?? body.episodeNum), 10) || 1);
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (
    body.streamUrl !== undefined ||
    body.hostedExternally !== undefined ||
    body.providerId !== undefined ||
    body.providerPath !== undefined
  ) {
    const source = await resolveEpisodeSource(body);
    if (!source.ok) return NextResponse.json({ error: source.error }, { status: 400 });
    data.streamUrl = source.streamUrl;
    data.hostedExternally = source.hostedExternally;
    data.providerId = source.providerId;
    data.providerPath = source.providerPath;
  }

  const stream = await prisma.stream.update({ where: { id }, data });

  if (body.bouquetIds !== undefined) {
    await syncStreamBouquets(id, Array.isArray(body.bouquetIds) ? body.bouquetIds : []);
  }

  await invalidatePlaybackUrls(id);
  await invalidateXtreamCategories();
  await invalidateDashboardStats();

  return NextResponse.json({
    episode: {
      id: stream.id,
      title: stream.name,
      season: stream.seasonNum ?? 1,
      episode: stream.episodeNum ?? 1,
      streamUrl: stream.streamUrl,
      isActive: stream.isActive,
      hostedExternally: stream.hostedExternally,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.stream.delete({ where: { id } });
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true });
}
