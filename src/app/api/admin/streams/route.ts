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
import { cacheGetOrSet } from "@/lib/cache";
import {
  invalidateDashboardStats,
  invalidatePlaybackUrls,
  invalidateXtreamCategories,
} from "@/lib/cache-invalidate";
import { syncStreamBouquets } from "@/lib/stream-bouquets";
import { expandCategoryFilter } from "@/lib/category-tree";
import { getResellerBouquetIds } from "@/lib/reseller-bouquet-scope";
import { canAccessBouquet } from "@/lib/bouquet-access";
import { listOnlineLiveStreamIds } from "@/lib/connections";



import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { streamListOrderBy } from "@/lib/stream-order";
import { attachStreamEpgWorking } from "@/lib/epg-working-status";
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

  if (req.nextUrl.searchParams.get("totals") === "1") {
    const resellerBouquetIds = await getResellerBouquetIds(session);
    if (resellerBouquetIds !== null && !resellerBouquetIds.length) {
      return NextResponse.json({ LIVE: 0, MOVIE: 0, SERIES: 0 });
    }
    const totalsKey =
      resellerBouquetIds === null
        ? "admin:stream-type-totals:v1"
        : `admin:stream-type-totals:v1:${session.id}`;
    const totals = await cacheGetOrSet(totalsKey, 20, async () => {
      const totalsWhere: Prisma.StreamWhereInput = {};
      if (resellerBouquetIds !== null) {
        totalsWhere.bouquets = { some: { bouquetId: { in: resellerBouquetIds } } };
      }
      const rows = await prisma.stream.groupBy({
        by: ["type"],
        where: totalsWhere,
        _count: true,
      });
      const next: Record<string, number> = { LIVE: 0, MOVIE: 0, SERIES: 0 };
      for (const r of rows) next[r.type] = r._count;
      return next;
    });
    return NextResponse.json(totals);
  }

  const typeParam = req.nextUrl.searchParams.get("type");

  const vodMode = req.nextUrl.searchParams.get("vodMode");

  const hosted = req.nextUrl.searchParams.get("hosted");
  const created = req.nextUrl.searchParams.get("created");
  const radio = req.nextUrl.searchParams.get("radio");
  const video = req.nextUrl.searchParams.get("video");
  const episodesOnly = req.nextUrl.searchParams.get("episodesOnly") === "1";
  const seriesSeedsOnly = req.nextUrl.searchParams.get("seriesSeedsOnly") === "1";

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    500,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10) || 50)
  );
  const picker = req.nextUrl.searchParams.get("picker") === "1";
  const withStats = req.nextUrl.searchParams.get("withStats") === "1";
  const skipTotal = req.nextUrl.searchParams.get("skipTotal") === "1";
  const skipEpg = req.nextUrl.searchParams.get("skipEpg") === "1";
  const paginate = true;
  const lite = req.nextUrl.searchParams.get("full") !== "1";
  const search = req.nextUrl.searchParams.get("search")?.trim();
  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim();
  const bouquetId = req.nextUrl.searchParams.get("bouquetId")?.trim();
  const idsParam = req.nextUrl.searchParams.get("ids")?.trim();
  const serverId = req.nextUrl.searchParams.get("serverId")?.trim();
  const statusParam = req.nextUrl.searchParams.get("status")?.trim()?.toLowerCase();
  const sourceIssue = req.nextUrl.searchParams.get("sourceIssue")?.trim()?.toLowerCase();
  const missingEpg = req.nextUrl.searchParams.get("missingEpg") === "1";

  const where: Prisma.StreamWhereInput = {};

  const resellerBouquetIds = await getResellerBouquetIds(session);
  if (resellerBouquetIds !== null) {
    if (!resellerBouquetIds.length) {
      return NextResponse.json({
        streams: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      });
    }
    if (bouquetId && !(await canAccessBouquet(session, bouquetId))) {
      return NextResponse.json({ error: "Forbidden bouquet" }, { status: 403 });
    }
    if (!bouquetId) {
      where.bouquets = { some: { bouquetId: { in: resellerBouquetIds } } };
    }
  }



  if (typeParam && Object.values(StreamType).includes(typeParam as StreamType)) {

    where.type = typeParam as StreamType;

  }

  if (statusParam === "active") where.isActive = true;
  if (statusParam === "inactive") where.isActive = false;
  if (statusParam === "offline") {
    where.isActive = true;
    where.lastProbeOk = false;
    if (!where.type) where.type = StreamType.LIVE;
  }
  if (statusParam === "online") {
    const onlineIds = await listOnlineLiveStreamIds(
      session.role === PanelRole.ADMIN ? undefined : session.id
    );
    where.isActive = true;
    if (!where.type) where.type = StreamType.LIVE;
    where.id = { in: onlineIds.length ? onlineIds : ["__none__"] };
  }
  if (sourceIssue === "dead" || sourceIssue === "unstable") {
    where.isActive = true;
    where.lastProbeOk = false;
    where.type = StreamType.LIVE;
    const backupCondition: Prisma.StreamWhereInput =
      sourceIssue === "dead"
        ? { OR: [{ backupUrl: null }, { backupUrl: "" }] }
        : { AND: [{ backupUrl: { not: null } }, { backupUrl: { not: "" } }] };
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      backupCondition,
    ];
  }
  if (missingEpg) {
    // Use AND so this does not clash with video/search OR filters
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ epgChannelId: null }, { epgChannelId: "" }] },
    ];
    if (!where.type) where.type = StreamType.LIVE;
    where.isRadio = false;
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

  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (ids.length) where.id = { in: ids };
  }
  if (bouquetId) {
    where.bouquets = { some: { bouquetId } };
  }
  if (episodesOnly) {
    where.type = StreamType.SERIES;
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [{ episodeNum: { not: null, gt: 0 } }, { name: { contains: "E", mode: "insensitive" } }],
      },
    ];
  } else if (seriesSeedsOnly) {
    where.type = StreamType.SERIES;
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ episodeNum: null }, { episodeNum: 0 }] },
    ];
  }
  if (categoryId) {
    if (categoryId === "0" || categoryId.toLowerCase() === "uncategorized") {
      where.categoryId = null;
    } else {
      const ids = await expandCategoryFilter(categoryId);
      where.categoryId = { in: ids };
    }
  }
  if (serverId) where.serverId = serverId;
  if (search) {
    const tmdbNumeric = /^\d+$/.test(search) ? Number(search) : null;
    const orFilters: Prisma.StreamWhereInput[] = [
      { name: { contains: search, mode: "insensitive" } },
      { streamUrl: { contains: search, mode: "insensitive" } },
      { channelId: { contains: search, mode: "insensitive" } },
      { epgChannelId: { contains: search, mode: "insensitive" } },
      { seriesName: { contains: search, mode: "insensitive" } },
      { agentStartCmd: { contains: `"tmdbId":"${search}"` } },
      { agentStartCmd: { contains: `"tmdbId":${search}` } },
    ];
    if (tmdbNumeric != null && Number.isFinite(tmdbNumeric)) {
      const jobs = await prisma.tmdbSyncJob.findMany({
        where: { tmdbId: tmdbNumeric, streamId: { not: null } },
        select: { streamId: true },
        take: 500,
      });
      const ids = jobs.map((j) => j.streamId).filter((id): id is string => Boolean(id));
      if (ids.length) orFilters.push({ id: { in: ids } });
    }
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: orFilters },
    ];
  }



  const skip = paginate ? (page - 1) * pageSize : undefined;
  const take = paginate ? pageSize : undefined;
  const orderBy = streamListOrderBy(
    req.nextUrl.searchParams.get("sort"),
    typeParam && Object.values(StreamType).includes(typeParam as StreamType)
      ? (typeParam as StreamType)
      : null
  );

  const streams = lite
    ? await prisma.stream.findMany({
        where,
        skip,
        take,
        orderBy,
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
          channelId: true,
          timeshiftSeconds: true,
          isShifted: true,
          hostedExternally: true,
          agentStartCmd: true,
          lastProbeOk: true,
          streamIcon: true,
          sortOrder: true,
          server: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      })
    : await prisma.stream.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: true,
          server: true,
          provider: { select: { id: true, name: true, providerType: true } },
          parentStream: { select: { id: true, name: true } },
          _count: { select: { childStreams: true } },
        },
      });



  if (picker) {
    const total = skipTotal ? streams.length : await prisma.stream.count({ where });
    const slim = streams.map((s) => ({
      id: s.id,
      name: s.name,
      label: s.name,
      sublabel: s.type,
      group: s.category?.name ?? undefined,
    }));
    return NextResponse.json({
      items: slim,
      streams: slim,
      total,
      page,
      pageSize,
    });
  }



  const listed = skipEpg
    ? streams.map((s) => ({ ...s, epgWorking: false }))
    : await attachStreamEpgWorking(streams);

  if (withStats && listed.length) {
    const statsInputs = listed.map((s) => ({
      id: s.id,
      isActive: s.isActive,
      lastProbeOk: "lastProbeOk" in s ? s.lastProbeOk : null,
      vodMode: s.vodMode,
      isOnDemand: s.isOnDemand,
      isCreatedChannel: s.isCreatedChannel ?? false,
      agentStartCmd: ("agentStartCmd" in s ? (s.agentStartCmd as string | null) : null),
      autoRestart: "autoRestart" in s ? Boolean(s.autoRestart) : true,
      streamUrl: s.streamUrl,
      hostedExternally: s.hostedExternally ?? false,
    }));
    const statsMap = await getStreamLiveStatsMap(statsInputs);
    const enriched = redactStreams(
      listed.map((s) => ({
        ...s,
        liveStats: statsMap.get(s.id) ?? null,
      })),
      session.role
    );
    if (paginate) {
      const total = skipTotal ? undefined : await prisma.stream.count({ where });
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

  const safeStreams = redactStreams(listed, session.role);

  if (paginate) {
    const total = skipTotal ? undefined : await prisma.stream.count({ where });
    return NextResponse.json({ streams: safeStreams, total, page, pageSize });
  }
  return NextResponse.json({ streams: safeStreams });

}



export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const parsed = await parseJsonBody(req);



  if (!parsed.ok) return parsed.response;



  const body = parsed.data;

  const err = validateStreamCreate(body);

  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const advErr = validateStreamAdvancedFields(body);

  if (advErr) return NextResponse.json({ error: advErr }, { status: 400 });



  try {
    if (body.isCreatedChannel) {
      const { captureDeviceInputArgs } = await import("@/lib/ffmpeg-overlay");
      const src = String(body.source ?? body.streamUrl ?? "");
      const isCapture = Boolean(captureDeviceInputArgs(src));
      if (!isCapture) {
        const { isRestreamAllowed } = await import("@/lib/restream-policy");
        if (!(await isRestreamAllowed())) {
          return NextResponse.json(
            { error: "Restreaming is disabled. Enable it under Settings → Streaming." },
            { status: 400 }
          );
        }
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
      const baseOrder = stream.sortOrder ?? 0;
      await prisma.bouquetStream.createMany({
        data: bouquetIds.map((bouquetId: string, i: number) => ({
          bouquetId,
          streamId: stream.id,
          sortOrder: baseOrder + i,
        })),
        skipDuplicates: true,
      });
    }

    if (stream.type === StreamType.MOVIE || stream.type === StreamType.SERIES) {
      const { ensureIptvVodBouquetMembership } = await import("@/lib/integration-bouquet");
      await ensureIptvVodBouquetMembership(stream.id, stream.type, stream.sortOrder ?? 0);
    }

    void Promise.allSettled([invalidateXtreamCategories(), invalidateDashboardStats()]);

    try {
      const { logActivity } = await import("@/lib/lines");
      await logActivity("create_stream", {
        userId: session.id,
        entity: "stream",
        entityId: stream.id,
        meta: { name: stream.name, type: stream.type },
      });
    } catch {
      /* non-fatal */
    }

    // LIVE streams: auto-map EPG from guide (tvg-id / name) when possible — never block create >3s
    let epgAutoAssigned: { epgChannelId: string; epgChannelName: string; score: number } | null = null;
    if (stream.type === StreamType.LIVE && !String(stream.epgChannelId ?? "").trim()) {
      try {
        const { autoAssignEpgToStream } = await import("@/lib/epg-auto-match");
        const match = await Promise.race([
          autoAssignEpgToStream({
            streamId: stream.id,
            name: stream.name,
            channelId: stream.channelId,
            epgChannelId: stream.epgChannelId,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (match?.epgChannelId) {
          epgAutoAssigned = match;
          return NextResponse.json({
            stream: { ...stream, epgChannelId: match.epgChannelId },
            probe,
            epgAutoAssigned: match,
          });
        }
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({ stream, probe, epgAutoAssigned });

  } catch (e) {

    return NextResponse.json(

      { error: e instanceof Error ? e.message : "Failed to create stream" },

      { status: 400 }

    );

  }

  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}



export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const parsed = await parseJsonBody(req);



  if (!parsed.ok) return parsed.response;



  const body = parsed.data;

  const id = String(body.id ?? "");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });



  const advErr = validateStreamAdvancedFields(body);

  if (advErr) return NextResponse.json({ error: advErr }, { status: 400 });



  const data: Record<string, unknown> = {};

  if (body.name != null) data.name = body.name;

  if (body.streamIcon !== undefined) data.streamIcon = body.streamIcon || null;

  const hostedRequested =
    body.hostedExternally === true ||
    (Boolean(body.providerId) && Boolean(String(body.providerPath ?? "").trim()));

  if (hostedRequested) {
    const providerId = String(body.providerId ?? "").trim();
    const providerPath = String(body.providerPath ?? "").trim();
    if (providerId && providerPath) {
      const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
      if (!provider) return NextResponse.json({ error: "Selected provider not found" }, { status: 400 });
      if (!provider.isActive) return NextResponse.json({ error: "Selected provider is disabled" }, { status: 400 });
      const { resolveProviderUrl } = await import("@/lib/vod-provider-url");
      data.streamUrl = resolveProviderUrl(provider, providerPath);
      data.providerId = providerId;
      data.providerPath = providerPath;
      data.hostedExternally = true;
    } else {
      if (providerId) {
        const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
        if (!provider) return NextResponse.json({ error: "Selected provider not found" }, { status: 400 });
        if (!provider.isActive) return NextResponse.json({ error: "Selected provider is disabled" }, { status: 400 });
        data.providerId = providerId;
      } else if (body.providerId !== undefined) {
        data.providerId = null;
      }
      data.providerPath = providerPath || null;
      data.hostedExternally = true;
      if (body.source != null || body.streamUrl != null) {
        const rawSource = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));
        if (!rawSource) {
          return NextResponse.json(
            { error: "Paste the provider URL, or pick a provider and path" },
            { status: 400 }
          );
        }
        const { streamUrl } = resolveSourceToStreamUrl(rawSource, getMediaImportRoot());
        data.streamUrl = streamUrl;
      }
    }
  } else if (body.source != null || body.streamUrl != null) {
    const rawSource = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));
    if (rawSource) {
      const { streamUrl } = resolveSourceToStreamUrl(rawSource, getMediaImportRoot());
      data.streamUrl = streamUrl;
      data.providerId = null;
      data.providerPath = null;
      data.hostedExternally = false;
    }
  } else if (body.hostedExternally === false) {
    data.providerId = null;
    data.providerPath = null;
    data.hostedExternally = false;
  }

  if (body.type != null && Object.values(StreamType).includes(body.type as StreamType)) {
    data.type = body.type;
  }

  if (body.serverId !== undefined) data.serverId = body.serverId || null;

  if (body.categoryId !== undefined) {
    const next = body.categoryId ? String(body.categoryId).trim() : "";
    // Do not wipe category when client sends empty (common select race). Explicit clear only.
    if (next) data.categoryId = next;
    else if (body.clearCategory === true) data.categoryId = null;
  }

  if (body.epgChannelId !== undefined) data.epgChannelId = body.epgChannelId || null;

  if (body.channelId !== undefined) data.channelId = body.channelId || null;

  if (body.minSpeedKbps !== undefined) data.minSpeedKbps = body.minSpeedKbps != null ? Number(body.minSpeedKbps) : null;

  if (body.maxSpeedKbps !== undefined) data.maxSpeedKbps = body.maxSpeedKbps != null ? Number(body.maxSpeedKbps) : null;

  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (body.backupUrl !== undefined) {
    data.backupUrl = body.backupUrl ? String(body.backupUrl).trim() || null : null;
  }

  if (body.playlistUrl !== undefined) {
    data.playlistUrl = body.playlistUrl ? String(body.playlistUrl).trim() || null : null;
  }

  if (body.archiveDays !== undefined) {
    data.archiveDays = body.archiveDays != null && body.archiveDays !== "" ? Number(body.archiveDays) : null;
  }

  if (body.containerExtension !== undefined) {
    data.containerExtension = body.containerExtension ? String(body.containerExtension).trim() || "mp4" : "mp4";
  }

  if (body.seriesName !== undefined) data.seriesName = body.seriesName ? String(body.seriesName) : null;
  if (body.seasonNum !== undefined) {
    data.seasonNum = body.seasonNum != null && body.seasonNum !== "" ? Number(body.seasonNum) : null;
  }
  if (body.episodeNum !== undefined) {
    data.episodeNum = body.episodeNum != null && body.episodeNum !== "" ? Number(body.episodeNum) : null;
  }

  if (body.isAdult !== undefined) data.isAdult = Boolean(body.isAdult);
  if (body.isRadio !== undefined) data.isRadio = Boolean(body.isRadio);
  if (body.isCreatedChannel !== undefined) data.isCreatedChannel = Boolean(body.isCreatedChannel);
  if (body.autoRestart !== undefined) data.autoRestart = Boolean(body.autoRestart);

  if (body.vodTmdb !== undefined) {
    const existing = await prisma.stream.findUnique({
      where: { id },
      select: { agentStartCmd: true, type: true },
    });
    if (existing && (existing.type === StreamType.MOVIE || existing.type === StreamType.SERIES)) {
      const { mergeVodTmdbFields } = await import("@/lib/vod-meta");
      const fields =
        body.vodTmdb && typeof body.vodTmdb === "object" && !Array.isArray(body.vodTmdb)
          ? (body.vodTmdb as Record<string, unknown>)
          : {};
      data.agentStartCmd = mergeVodTmdbFields(existing.agentStartCmd, {
        tmdbId: String(fields.tmdbId ?? ""),
        tmdbTitle: String(fields.tmdbTitle ?? ""),
        tmdbOverview: String(fields.tmdbOverview ?? ""),
        tmdbCast: String(fields.tmdbCast ?? ""),
        tmdbGenres: String(fields.tmdbGenres ?? ""),
        tmdbPoster: String(fields.tmdbPoster ?? ""),
        tmdbBackdrop: String(fields.tmdbBackdrop ?? ""),
        tmdbRelease: String(fields.tmdbRelease ?? ""),
        tmdbRating: String(fields.tmdbRating ?? ""),
        tmdbTrailer: String(fields.tmdbTrailer ?? ""),
        tmdbDirector: String(fields.tmdbDirector ?? ""),
        tmdbRuntime: String(fields.tmdbRuntime ?? ""),
      });
    }
  }

  if (body.autoSyncNameFromEpg !== undefined) {
    const { parseLiveStreamMeta, encodeLiveStreamMeta } = await import("@/lib/stream-live-meta");
    const existing = await prisma.stream.findUnique({
      where: { id },
      select: { agentStartCmd: true },
    });
    const meta = parseLiveStreamMeta(existing?.agentStartCmd);
    data.agentStartCmd = encodeLiveStreamMeta({
      ...(meta.raw ?? {}),
      autoSyncNameFromEpg: body.autoSyncNameFromEpg === true,
    });
  }

  if (body.directSource !== undefined) {
    const { parseLiveStreamMeta, encodeLiveStreamMeta } = await import("@/lib/stream-live-meta");
    const existing = await prisma.stream.findUnique({
      where: { id },
      select: { agentStartCmd: true, type: true },
    });
    if (existing?.type === "LIVE") {
      const meta = parseLiveStreamMeta(existing.agentStartCmd);
      data.agentStartCmd = encodeLiveStreamMeta({
        ...(meta.raw ?? {}),
        directSource: body.directSource === true,
      });
    }
  }

  if (body.transcodeProfile !== undefined) {
    const { parseLiveStreamMeta, encodeLiveStreamMeta } = await import("@/lib/stream-live-meta");
    const existing = await prisma.stream.findUnique({
      where: { id },
      select: { agentStartCmd: true, type: true },
    });
    const nextProfile = String(body.transcodeProfile ?? "none");
    const isVod = existing?.type === "MOVIE" || existing?.type === "SERIES";
    if (isVod) {
      const { parseVodAgentCmd, encodeVodAgentCmd } = await import("@/lib/vod-meta");
      const meta = parseVodAgentCmd(existing?.agentStartCmd);
      data.agentStartCmd = encodeVodAgentCmd({ ...meta, transcodeProfile: nextProfile });
    } else {
      const meta = parseLiveStreamMeta(existing?.agentStartCmd);
      data.agentStartCmd = encodeLiveStreamMeta({
        ...(meta.raw ?? {}),
        transcodeProfile: nextProfile,
        redirectStream: nextProfile === "none",
      });
    }
    if (nextProfile !== "none") {
      data.autoRestart = true;
    }
  }

  if (body.vodMode !== undefined || body.isOnDemand !== undefined) {
    const { syncVodModeFields } = await import("@/lib/resolve-stream-url");
    const synced = syncVodModeFields({
      vodMode: body.vodMode,
      isOnDemand: body.isOnDemand,
    });
    data.vodMode = synced.vodMode;
    data.isOnDemand = synced.isOnDemand;
  }

  if (

    body.timeshiftSeconds !== undefined ||

    body.isShifted !== undefined ||

    body.parentStreamId !== undefined ||

    body.dnsRotator !== undefined ||

    body.bitrates !== undefined

  ) {

    Object.assign(data, parseStreamAdvancedFields(body));

  }

  // Drop undefined keys — Prisma rejects unknown/undefined mixes on some versions
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  if (Number.isNaN(data.archiveDays as number)) data.archiveDays = null;
  if (Number.isNaN(data.timeshiftSeconds as number)) data.timeshiftSeconds = null;
  if (Number.isNaN(data.seasonNum as number)) data.seasonNum = null;
  if (Number.isNaN(data.episodeNum as number)) data.episodeNum = null;

  try {
    if (Object.keys(data).length === 0 && body.bouquetIds === undefined && body.autoEpg !== true) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const stream =
      Object.keys(data).length > 0
        ? await prisma.stream.update({
            where: { id },
            data,
            include: {
              category: true,
              server: true,
              parentStream: { select: { id: true, name: true } },
            },
          })
        : await prisma.stream.findUniqueOrThrow({
            where: { id },
            include: {
              category: true,
              server: true,
              parentStream: { select: { id: true, name: true } },
            },
          });

    if (body.bouquetIds !== undefined) {
      await syncStreamBouquets(id, Array.isArray(body.bouquetIds) ? body.bouquetIds : []);
    }

    if (stream.type === StreamType.MOVIE || stream.type === StreamType.SERIES) {
      const { ensureIptvVodBouquetMembership } = await import("@/lib/integration-bouquet");
      await ensureIptvVodBouquetMembership(stream.id, stream.type, stream.sortOrder ?? 0);
    }

    // Cache invalidation must never block the save response
    void Promise.allSettled([
      invalidatePlaybackUrls(id),
      invalidateXtreamCategories(),
      invalidateDashboardStats(),
    ]);

    // Auto-map EPG when live and still empty (or when client asks). Cap at 3s so Save never hangs.
    let epgAutoAssigned: { epgChannelId: string; epgChannelName: string; score: number } | null = null;
    const wantAutoEpg =
      stream.type === StreamType.LIVE &&
      (body.autoEpg === true || !String(stream.epgChannelId ?? "").trim());
    if (wantAutoEpg) {
      try {
        const { autoAssignEpgToStream } = await import("@/lib/epg-auto-match");
        const match = await Promise.race([
          autoAssignEpgToStream({
            streamId: stream.id,
            name: stream.name,
            channelId: stream.channelId,
            epgChannelId: stream.epgChannelId,
            forceRematch: body.autoEpg === true,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (match?.epgChannelId) {
          epgAutoAssigned = match;
          (stream as { epgChannelId?: string | null }).epgChannelId = match.epgChannelId;
        }
      } catch {
        /* non-fatal — save already succeeded */
      }
    }

    try {
      const { logActivity } = await import("@/lib/lines");
      await logActivity("edit_stream", {
        userId: session.id,
        entity: "stream",
        entityId: id,
        meta: { name: stream.name },
      });
    } catch {
      /* non-fatal */
    }
    return NextResponse.json({ stream, epgAutoAssigned });
  } catch (e) {
    console.error("[PATCH /api/admin/streams]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save stream" },
      { status: 500 }
    );
  }

  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}



export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const id = req.nextUrl.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });



  await prisma.stream.delete({ where: { id } });

  await invalidatePlaybackUrls(id);
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true });

  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

