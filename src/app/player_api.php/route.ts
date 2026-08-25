import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed, playbackDenyMessage } from "@/lib/playback-guard";
import {
  serverBaseUrl,
  xtreamUserInfo,
  xtreamLiveCategoriesForLine,
  xtreamVodCategoriesForLine,
  xtreamSeriesCategoriesForLine,
} from "@/lib/xtream";
import { xtreamVodInfo, xtreamSeriesInfo, emptyXtreamSeriesInfo } from "@/lib/xtream-info";
import { cuidToNum, resolveStreamIdParam } from "@/lib/xtream-stream-id";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { getShortEpgForChannelIds } from "@/lib/epg";
import { streamHasArchive } from "@/lib/catchup-playback-url";
import { getAntiFreezeSettings, schedulePlaylistZapWarm, schedulePlaybackUpstreamWarm } from "@/lib/anti-freeze";
import { iptvCorsPreflight } from "@/lib/iptv-cors";
import { iptvJson } from "@/lib/iptv-json";
import { resolveClientPlaybackProfile } from "@/lib/client-playback-profiles";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";
import { serveXtreamCatalogJson, warmXtreamCatalogs } from "@/lib/xtream-catalog-blob";
import { warmLineXmltv } from "@/lib/xmltv-export";
import { prisma } from "@/lib/prisma";
import { resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { UPSTREAM_HLS_UA } from "@/lib/hls-playback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function xtreamEpgStreamParam(params: URLSearchParams): string {
  return (
    params.get("stream_id") ||
    params.get("channel_id") ||
    params.get("epg_channel_id") ||
    ""
  ).trim();
}

async function resolveXtreamEpgListings(
  lineId: string,
  streamId: string,
  limit: number
): Promise<Awaited<ReturnType<typeof getShortEpgForChannelIds>>> {
  const resolved = await resolveStreamIdParam(streamId, { lineId });
  const stream = resolved
    ? await prisma.stream.findUnique({
        where: { id: resolved },
        select: {
          epgChannelId: true,
          channelId: true,
          id: true,
          vodMode: true,
          archiveDays: true,
          timeshiftSeconds: true,
          isShifted: true,
        },
      })
    : null;
  const channelIds = stream
    ? [
        stream.epgChannelId,
        stream.channelId,
        stream.id,
        streamId,
        String(cuidToNum(stream.id)),
      ].filter((v): v is string => Boolean(v?.trim()))
    : [streamId];
  const archivable = stream ? streamHasArchive(stream) : false;
  return getShortEpgForChannelIds(channelIds, limit, archivable);
}

function warmVodPlayback(
  lineId: string,
  streamIdParam: string,
  ip?: string | null,
  userAgent?: string | null
): void {
  void (async () => {
    const streamId = await resolveStreamIdParam(streamIdParam, { lineId });
    if (!streamId) return;
    const url = await resolvePlaybackUrlForLine(lineId, streamId, {
      clientIp: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      skipGeo: true,
    });
    if (url) schedulePlaybackUpstreamWarm(url, UPSTREAM_HLS_UA);
  })().catch(() => undefined);
}

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(req: NextRequest) {
  return handlePlayerApi(req, req.nextUrl.searchParams);
}

/** XUI.one / Xtream apps POST username, password, action as form fields. */
export async function POST(req: NextRequest) {
  return handlePlayerApi(req, await mergeXtreamRequestParams(req));
}

async function handlePlayerApi(req: NextRequest, params: URLSearchParams) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const j = (data: unknown, init?: ResponseInit) =>
    iptvJson(data, { ...init, compressFor: req });

  try {
    return await handlePlayerApiInner(req, params, j);
  } catch (e) {
    console.error("[player_api]", e instanceof Error ? e.message : e);
    return j({ user_info: { auth: 0, message: "Temporary error" } }, { status: 500 });
  }
}

async function handlePlayerApiInner(
  req: NextRequest,
  params: URLSearchParams,
  j: (data: unknown, init?: ResponseInit) => Promise<NextResponse>
) {
  const username = params.get("username");
  const password = params.get("password");
  const action = params.get("action");

  if (!username || !password) {
    return j({ error: "credentials required" }, { status: 400 });
  }

  const line = await getLineByCredentials(username, password);
  if (!line) {
    return j(
      { user_info: { auth: 0, message: "Invalid credentials" } },
      { status: 401 }
    );
  }

  const ip = getClientIp(req);
  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    ip,
    req.headers.get("user-agent") ?? undefined,
    { listingOnly: true }
  );
  if (deny) {
    return j(
      { user_info: { auth: 0, message: playbackDenyMessage(deny) } },
      { status: deny === "rate" || deny === "ddos" ? 429 : 403 }
    );
  }

  const baseUrl = serverBaseUrl(req.url, req.headers);
  const userAgent = req.headers.get("user-agent");

  if (!action) {
    warmXtreamCatalogs(line);
    warmLineXmltv(line);
    return j(await xtreamUserInfo(line, baseUrl, userAgent));
  }

  switch (action) {
    case "get_live_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:live_categories:v6:${line.id}`,
        Math.max(300, ttl.categories),
        () => xtreamLiveCategoriesForLine(line)
      );
      return j(payload);
    }
    case "get_live_streams": {
      const categoryId = params.get("category_id");
      const profile = resolveClientPlaybackProfile(userAgent);
      return serveXtreamCatalogJson("live", line, req, categoryId, (ids) => {
        if (!profile.zapPrefetchOnPlaylist) return;
        void getAntiFreezeSettings().then((antiFreeze) => {
          schedulePlaylistZapWarm(
            line.id,
            ids,
            { clientIp: ip, userAgent: userAgent ?? undefined },
            antiFreeze
          );
        });
      });
    }
    case "get_vod_streams": {
      const vodCategoryId = params.get("category_id");
      return serveXtreamCatalogJson("vod", line, req, vodCategoryId);
    }
    case "get_vod_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:vod_categories:v4:${line.id}`,
        Math.max(300, ttl.categories),
        () => xtreamVodCategoriesForLine(line)
      );
      return j(payload);
    }
    case "get_series_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:series_categories:v4:${line.id}`,
        Math.max(300, ttl.categories),
        () => xtreamSeriesCategoriesForLine(line)
      );
      return j(payload);
    }
    case "get_series": {
      const seriesCategoryId = params.get("category_id");
      return serveXtreamCatalogJson("series", line, req, seriesCategoryId);
    }
    case "get_vod_info": {
      const vodId = params.get("vod_id") || params.get("stream_id") || "";
      if (!vodId) return j({});
      const info = await cacheGetOrSet(`xtream:vod_info:${line.id}:${vodId}`, 300, () =>
        xtreamVodInfo(line, baseUrl, vodId)
      );
      if (info) warmVodPlayback(line.id, vodId, ip, userAgent);
      return j(info ?? {});
    }
    case "get_series_info": {
      const seriesId = params.get("series_id") || params.get("stream_id") || "";
      if (!seriesId) return j(emptyXtreamSeriesInfo());
      const info = await cacheGetOrSet(`xtream:series_info:${line.id}:${seriesId}`, 120, async () => {
        const row = await xtreamSeriesInfo(line, baseUrl, seriesId);
        return row ?? emptyXtreamSeriesInfo();
      });
      if (info && (info as { info?: { name?: string } }).info?.name) {
        warmVodPlayback(line.id, seriesId, ip, userAgent);
      }
      return j(info ?? emptyXtreamSeriesInfo());
    }
    case "get_short_epg": {
      const streamId = xtreamEpgStreamParam(params);
      if (!streamId) return j({ epg_listings: [] });
      const epg = await resolveXtreamEpgListings(line.id, streamId, 4);
      return j({ epg_listings: epg });
    }
    case "get_epg": {
      const streamId = xtreamEpgStreamParam(params);
      if (!streamId) return j({ epg_listings: [] });
      const limit = Math.min(
        500,
        Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50)
      );
      const epg = await resolveXtreamEpgListings(line.id, streamId, limit);
      return j({ epg_listings: epg });
    }
    case "get_simple_data_table": {
      const streamId = xtreamEpgStreamParam(params);
      if (!streamId) return j({ epg_listings: [] });
      return j({ epg_listings: await resolveXtreamEpgListings(line.id, streamId, 10) });
    }
    case "get_user_info":
      return j(await xtreamUserInfo(line, baseUrl, userAgent));
    case "get_server_info": {
      const payload = await xtreamUserInfo(line, baseUrl, userAgent);
      return j(payload.server_info);
    }
    case "get_bouquets": {
      const rows = (line.bouquets ?? []).map((lb) => ({
        bouquet_id: String(
          Math.abs(
            [...String(lb.bouquet.id)].reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0)
          )
        ),
        bouquet_name: lb.bouquet.name,
      }));
      return j(rows);
    }
    default:
      return j(await xtreamUserInfo(line, baseUrl, userAgent));
  }
}

