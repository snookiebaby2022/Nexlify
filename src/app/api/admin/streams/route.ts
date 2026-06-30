import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

import { PanelRole, StreamType, VodMode, type Prisma } from "@prisma/client";

import { validateStreamCreate } from "@/lib/stream-source";

import { buildStreamCreateData } from "@/lib/stream-create-data";

import { parseStreamAdvancedFields, validateStreamAdvancedFields } from "@/lib/stream-fields";

import { normalizeStreamSource } from "@/lib/stream-source";

import { resolveSourceToStreamUrl, getMediaImportRoot } from "@/lib/import-media";

import { probeMediaFile } from "@/lib/media-probe";
import { getStreamLiveStatsMap } from "@/lib/stream-live-stats";
import { redactStreams } from "@/lib/stream-redact";
import {
  invalidateDashboardStats,
  invalidatePlaybackUrls,
  invalidateXtreamCategories,
} from "@/lib/cache-invalidate";
import { syncStreamBouquets } from "@/lib/stream-bouquets";



export async function GET(req: NextRequest) {

  const session = await requireSession([

    PanelRole.ADMIN,

    PanelRole.RESELLER,

    PanelRole.SUB_RESELLER,

  ]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const typeParam = req.nextUrl.searchParams.get("type");

  const vodMode = req.nextUrl.searchParams.get("vodMode");

  const hosted = req.nextUrl.searchParams.get("hosted");
  const created = req.nextUrl.searchParams.get("created");
  const radio = req.nextUrl.searchParams.get("radio");
  const video = req.nextUrl.searchParams.get("video");

  const picker = req.nextUrl.searchParams.get("picker") === "1";
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10) || 50)
  );
  const paginate = req.nextUrl.searchParams.has("page") || req.nextUrl.searchParams.has("pageSize");
  const withStats = req.nextUrl.searchParams.get("withStats") === "1";
  const search = req.nextUrl.searchParams.get("search")?.trim();
  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim();
  const serverId = req.nextUrl.searchParams.get("serverId")?.trim();

  const where: Prisma.StreamWhereInput = {};



  if (typeParam && Object.values(StreamType).includes(typeParam as StreamType)) {

    where.type = typeParam as StreamType;

  }

  if (vodMode && Object.values(VodMode).includes(vodMode as VodMode)) {

    where.vodMode = vodMode as VodMode;

  }

  if (hosted === "1") where.hostedExternally = true;

  if (hosted === "0") where.hostedExternally = false;

  if (created === "1") where.isCreatedChannel = true;

  if (radio === "1") {
    where.isRadio = true;
    where.type = "LIVE";
  }

  if (video === "1") {
    where.type = "LIVE";
    where.isRadio = false;
    where.isCreatedChannel = false;
    where.OR = [
      { isOnDemand: true },
      { vodMode: VodMode.ON_DEMAND },
      { streamUrl: { contains: ".mp4" } },
      { streamUrl: { contains: ".mkv" } },
      { streamUrl: { contains: "file://" } },
    ];
  }

  if (categoryId) where.categoryId = categoryId;
  if (serverId) where.serverId = serverId;
  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [{ name: { contains: search } }, { streamUrl: { contains: search } }],
      },
    ];
  }



  const skip = paginate ? (page - 1) * pageSize : undefined;
  const take = paginate ? pageSize : undefined;

  const streams = lite
    ? await prisma.stream.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          streamUrl: true,
          type: true,
          isActive: true,
          vodMode: true,
          isOnDemand: true,
          isRadio: true,
          isCreatedChannel: true,
          serverId: true,
          categoryId: true,
          epgChannelId: true,
          timeshiftSeconds: true,
          isShifted: true,
          hostedExternally: true,
          lastProbeOk: true,
          lastProbeError: true,
          agentStartCmd: true,
          autoRestart: true,
          sortOrder: true,
          server: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    : await prisma.stream.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          server: true,
          provider: { select: { id: true, name: true, providerType: true } },
          parentStream: { select: { id: true, name: true } },
          _count: { select: { childStreams: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });



  if (picker) {

    return NextResponse.json({

      items: streams.map((s) => ({

        id: s.id,

        label: s.name,

        sublabel: s.type,

        group: s.category?.name ?? undefined,

      })),

    });

  }



  if (withStats && streams.length) {
    const statsInputs = streams.map((s) => ({
      id: s.id,
      isActive: s.isActive,
      lastProbeOk: "lastProbeOk" in s ? s.lastProbeOk : null,
      vodMode: s.vodMode,
      isOnDemand: s.isOnDemand,
      isCreatedChannel: s.isCreatedChannel ?? false,
      agentStartCmd: "agentStartCmd" in s ? s.agentStartCmd : null,
      autoRestart: "autoRestart" in s ? s.autoRestart : true,
      streamUrl: s.streamUrl,
      hostedExternally: s.hostedExternally ?? false,
    }));
    const statsMap = await getStreamLiveStatsMap(statsInputs);
    const enriched = redactStreams(
      streams.map((s) => ({
        ...s,
        liveStats: statsMap.get(s.id) ?? null,
      })),
      session.role
    );
    if (paginate) {
      const total = await prisma.stream.count({ where });
      return NextResponse.json({ streams: enriched, total, page, pageSize });
    }
    return NextResponse.json({ streams: enriched });
  }

  const singleStatsId = req.nextUrl.searchParams.get("streamId");
  if (withStats && singleStatsId) {
    const row = await prisma.stream.findUnique({
      where: { id: singleStatsId },
      select: {
        id: true,
        isActive: true,
        lastProbeOk: true,
        vodMode: true,
        isOnDemand: true,
        isCreatedChannel: true,
        agentStartCmd: true,
        autoRestart: true,
        streamUrl: true,
        hostedExternally: true,
      },
    });
    const statsMap = await getStreamLiveStatsMap(row ? [row] : []);
    return NextResponse.json({ liveStats: statsMap.get(singleStatsId) ?? null });
  }

  const safeStreams = redactStreams(streams, session.role);

  if (paginate) {
    const total = await prisma.stream.count({ where });
    return NextResponse.json({ streams: safeStreams, total, page, pageSize });
  }
  return NextResponse.json({ streams: safeStreams });

}



export async function POST(req: NextRequest) {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const body = await req.json();

  const err = validateStreamCreate(body);

  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const advErr = validateStreamAdvancedFields(body);

  if (advErr) return NextResponse.json({ error: advErr }, { status: 400 });



  try {
    if (body.isCreatedChannel) {
      const { isRestreamAllowed } = await import("@/lib/restream-policy");
      if (!(await isRestreamAllowed())) {
        return NextResponse.json(
          { error: "Restreaming is disabled. Enable it under Settings → Streaming." },
          { status: 400 }
        );
      }
    }

    const { data, absolutePath } = await buildStreamCreateData(body);

    let probe = null;

    if (absolutePath) {

      probe = await probeMediaFile(absolutePath);

    }



    const stream = await prisma.stream.create({

      data,

      include: { provider: true, parentStream: { select: { id: true, name: true } } },

    });

    const bouquetIds: string[] = Array.isArray(body.bouquetIds) ? body.bouquetIds : [];
    if (bouquetIds.length) {
      await prisma.bouquetStream.createMany({
        data: bouquetIds.map((bouquetId: string, i: number) => ({
          bouquetId,
          streamId: stream.id,
          sortOrder: 9000 + i,
        })),
        skipDuplicates: true,
      });
    }

    await invalidateXtreamCategories();
    await invalidateDashboardStats();
    return NextResponse.json({ stream, probe });

  } catch (e) {

    return NextResponse.json(

      { error: e instanceof Error ? e.message : "Failed to create stream" },

      { status: 400 }

    );

  }

}



export async function PATCH(req: NextRequest) {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const body = await req.json();

  const id = String(body.id ?? "");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });



  const advErr = validateStreamAdvancedFields(body);

  if (advErr) return NextResponse.json({ error: advErr }, { status: 400 });



  const data: Record<string, unknown> = {};

  if (body.name != null) data.name = body.name;

  if (body.streamIcon !== undefined) data.streamIcon = body.streamIcon || null;

  if (body.source != null || body.streamUrl != null) {

    const rawSource = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));

    if (rawSource) {

      const { streamUrl } = resolveSourceToStreamUrl(rawSource, getMediaImportRoot());

      data.streamUrl = streamUrl;

    }

  }

  if (body.type != null) data.type = body.type;

  if (body.serverId !== undefined) data.serverId = body.serverId || null;

  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;

  if (body.epgChannelId !== undefined) data.epgChannelId = body.epgChannelId || null;

  if (body.channelId !== undefined) data.channelId = body.channelId || null;

  if (body.minSpeedKbps !== undefined) data.minSpeedKbps = body.minSpeedKbps != null ? Number(body.minSpeedKbps) : null;

  if (body.maxSpeedKbps !== undefined) data.maxSpeedKbps = body.maxSpeedKbps != null ? Number(body.maxSpeedKbps) : null;

  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);



  if (

    body.timeshiftSeconds !== undefined ||

    body.isShifted !== undefined ||

    body.parentStreamId !== undefined ||

    body.dnsRotator !== undefined ||

    body.bitrates !== undefined

  ) {

    Object.assign(data, parseStreamAdvancedFields(body));

  }



  const stream = await prisma.stream.update({

    where: { id },

    data,

    include: {

      category: true,

      server: true,

      parentStream: { select: { id: true, name: true } },

    },

  });



  if (body.bouquetIds !== undefined) {
    await syncStreamBouquets(id, Array.isArray(body.bouquetIds) ? body.bouquetIds : []);
  }

  await invalidatePlaybackUrls(id);
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ stream });

}



export async function DELETE(req: NextRequest) {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const id = req.nextUrl.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });



  await prisma.stream.delete({ where: { id } });

  await invalidatePlaybackUrls(id);
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true });

}

