import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType, type Prisma } from "@prisma/client";
import { syncStreamBouquets } from "@/lib/stream-bouquets";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const seriesId = req.nextUrl.searchParams.get("seriesId")?.trim();
  const where: Prisma.StreamWhereInput = { type: StreamType.SERIES };

  if (seriesId) {
    const parent = await prisma.stream.findUnique({ where: { id: seriesId } });
    if (!parent) return NextResponse.json({ episodes: [] });
    const seriesName = parent.seriesName ?? parent.name;
    where.seriesName = seriesName;
  }

  const rows = await prisma.stream.findMany({
    where,
    orderBy: [{ seasonNum: "asc" }, { episodeNum: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      streamUrl: true,
      seasonNum: true,
      episodeNum: true,
      seriesName: true,
    },
  });

  const episodes = rows.map((r) => ({
    id: r.id,
    title: r.name,
    season: r.seasonNum ?? 1,
    episode: r.episodeNum ?? 1,
    streamUrl: r.streamUrl,
    series: {
      id: seriesId ?? r.id,
      name: r.seriesName ?? r.name,
    },
  }));

  return NextResponse.json({ episodes });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const seriesId = String(body.seriesId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const streamUrl = String(body.streamUrl ?? "").trim();
  const season = Math.max(1, parseInt(String(body.season ?? body.seasonNum ?? 1), 10) || 1);
  const episode = Math.max(1, parseInt(String(body.episode ?? body.episodeNum ?? 1), 10) || 1);
  const bouquetIds: string[] = Array.isArray(body.bouquetIds) ? body.bouquetIds : [];

  if (!seriesId || !title || !streamUrl) {
    return NextResponse.json({ error: "seriesId, title, and streamUrl are required" }, { status: 400 });
  }

  const parent = await prisma.stream.findUnique({ where: { id: seriesId } });
  if (!parent || parent.type !== StreamType.SERIES) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const seriesName = parent.seriesName ?? parent.name;

  const stream = await prisma.stream.create({
    data: {
      name: title,
      streamUrl,
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
