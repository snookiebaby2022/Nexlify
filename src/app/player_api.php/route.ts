import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import {
  asPlaybackGuardLine,
  assertPlaybackAllowed,
  playbackDenyMessage,
} from "@/lib/playback-guard";
import { xtreamUnauthPayload } from "@/lib/xtream-unauth";
import {
  serverBaseUrl,
  xtreamUserInfo,
  xtreamLiveCategoriesForLine,
  xtreamLiveStreams,
  xtreamVodCategoriesForLine,
  xtreamSeriesCategoriesForLine,
} from "@/lib/xtream";
import {
  xtreamVodInfo,
  xtreamSeriesInfo,
  emptyXtreamSeriesInfo,
} from "@/lib/xtream-info";
import { cuidToNum, resolveStreamIdParam } from "@/lib/xtream-stream-id";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { lineBouquetCacheToken } from "@/lib/lines";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { getShortEpgForChannelIds } from "@/lib/epg";
import { streamHasArchive } from "@/lib/catchup-playback-url";
import {
  getAntiFreezeSettings,
  schedulePlaylistZapWarm,
  schedulePlaybackUpstreamWarm,
} from "@/lib/anti-freeze";
import { iptvCorsPreflight, withIptvCors } from "@/lib/iptv-cors";
import { iptvJson } from "@/lib/iptv-json";
import { resolveClientPlaybackProfile } from "@/lib/client-playback-profiles";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";
import {
  serveXtreamCatalogJson,
  warmXtreamLiveCatalogNow,
} from "@/lib/xtream-catalog-blob";
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
  limit: number,
): Promise<Awaited<ReturnType<typeof getShortEpgForChannelIds>>> {
  const ttl = await getCacheTtls();
  return cacheGetOrSet(`xtream:epg:list:${lineId}:${streamId}:${limit}`, ttl.epg, async () => {
    const resolved = await resolveStreamIdParam(streamId, { lineId });
    const stream = resolved
      ? await cacheGetOrSet(`xtream:epg:meta:${resolved}`, 300, async () =>
          prisma.stream.findUnique({
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
        )
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
  });
}

function warmVodPlayback(
  lineId: string,
  streamIdParam: string,
  ip?: string | null,
  userAgent?: string | null,
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

/** Smarters Pro (LG/Android) HEADs player_api.php with no credentials.
 *  Returning auth:0 JSON here is parsed as "Unauthorized Access" and Update Content fails. */
export async function HEAD() {
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=30",
      },
    }),
  );
}

/** XUI.one / Xtream apps POST username, password, action as form fields. */
export async function POST(req: NextRequest) {
  return handlePlayerApi(req, await mergeXtreamRequestParams(req));
}

async function handlePlayerApi(req: NextRequest, params: URLSearchParams) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const envelope = params.get("envelope") === "true";
  const j = (data: unknown, init?: ResponseInit) =>
    iptvJson(
      envelope ? { success: true, data } : data,
      {
        ...init,
        headers: { "Cache-Control": "private, max-age=60" },
        compressFor: req,
      },
    );

  try {
    return await handlePlayerApiInner(req, params, j);
  } catch (e) {
    console.error("[player_api]", e instanceof Error ? e.message : e);
    return j(
      { user_info: { auth: 0, message: "Temporary error" } },
      { status: 500 },
    );
  }
}

async function handlePlayerApiInner(
  req: NextRequest,
  params: URLSearchParams,
  j: (data: unknown, init?: ResponseInit) => Promise<NextResponse>,
) {
  const username = params.get("username") ?? params.get("user");
  const password = params.get("password") ?? params.get("pass");
  const action = params.get("action");
  const userAgent = req.headers.get("user-agent");
  const panelBase = serverBaseUrl(req.url, req.headers);

  if (!username || !password) {
    // XUI/Smarters Pro (LG/webOS) probe player_api.php with no credentials.
    // HTTP 400 is treated as "Authorization failed at host".
    return j(xtreamUnauthPayload(panelBase, userAgent));
  }

  const line = await getLineByCredentials(username, password);
  if (!line) {
    return j(xtreamUnauthPayload(panelBase, userAgent));
  }

  const ip = getClientIp(req);
  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    ip,
    userAgent ?? undefined,
    { listingOnly: true },
  );
  if (deny) {
    const payload = xtreamUnauthPayload(panelBase, userAgent);
    payload.user_info.message = playbackDenyMessage(deny);
    return j(
      payload,
      deny === "rate" || deny === "ddos" ? { status: 429 } : undefined,
    );
  }

  const baseUrl = panelBase;

  if (!action) {
    // Login/user_info only needs live ready for first zap. VOD/series are
    // warmed by cron; launching all three for every login caused DB storms.
    void warmXtreamLiveCatalogNow(line).catch(() => undefined);
    warmLineXmltv(line);
    return j(await xtreamUserInfo(line, baseUrl, userAgent));
  }

  const bouquetToken = lineBouquetCacheToken(line);

  switch (action) {
    case "get_live_categories": {
      const ttl = await getCacheTtls();
      const profile = resolveClientPlaybackProfile(userAgent);
      // Do not await the live catalog here — Smarters times out Update Content
      // and shows Unauthorized Access if this blocks on a 30k-stream gzip rebuild.
      void warmXtreamLiveCatalogNow(line).catch(() => undefined);
      const catKey = profile.numericCategoryId
        ? `xtream:live_categories:v10n:${bouquetToken}`
        : `xtream:live_categories:v9:${bouquetToken}`;
      const payload = await cacheGetOrSet(
        catKey,
        ttl.categories,
        () => xtreamLiveCategoriesForLine(line, profile.numericCategoryId),
      );
      return j(payload);
    }
    case "get_live_streams": {
      const categoryId = params.get("category_id");
      const profile = resolveClientPlaybackProfile(userAgent);
      // Nexus/Lavf bulk-loads then filters client-side — serve fresh inline JSON
      // (numeric category_id + normalized icons) instead of a stale gzip blob.
      if (profile.id === "nexus") {
        return j(
          await xtreamLiveStreams(line, baseUrl, categoryId, {
            numericCategoryId: profile.numericCategoryId,
          })
        );
      }
      return serveXtreamCatalogJson("live", line, req, categoryId, (ids) => {
        if (!profile.zapPrefetchOnPlaylist) return;
        void getAntiFreezeSettings().then((antiFreeze) => {
          schedulePlaylistZapWarm(
            line.id,
            ids,
            { clientIp: ip, userAgent: userAgent ?? undefined },
            antiFreeze,
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
        `xtream:vod_categories:v5:${bouquetToken}`,
        ttl.categories,
        () => xtreamVodCategoriesForLine(line),
      );
      return j(payload);
    }
    case "get_series_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:series_categories:v5:${bouquetToken}`,
        ttl.categories,
        () => xtreamSeriesCategoriesForLine(line),
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
      const info = await cacheGetOrSet(
        `xtream:vod_info:${line.id}:${vodId}`,
        60,
        () => xtreamVodInfo(line, baseUrl, vodId),
      );
      if (info) warmVodPlayback(line.id, vodId, ip, userAgent);
      return j(info ?? {});
    }
    case "get_series_info": {
      const seriesId = params.get("series_id") || params.get("stream_id") || "";
      if (!seriesId) return j(emptyXtreamSeriesInfo());
      const info = await cacheGetOrSet(
        `xtream:series_info:${line.id}:${seriesId}`,
        60,
        async () => {
          const row = await xtreamSeriesInfo(line, baseUrl, seriesId);
          return row ?? emptyXtreamSeriesInfo();
        },
      );
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
        Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50),
      );
      const epg = await resolveXtreamEpgListings(line.id, streamId, limit);
      return j({ epg_listings: epg });
    }
    case "get_simple_data_table": {
      const streamId = xtreamEpgStreamParam(params);
      if (!streamId) return j({ epg_listings: [] });
      return j({
        epg_listings: await resolveXtreamEpgListings(line.id, streamId, 10),
      });
    }
    case "get_account_info":
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
            [...String(lb.bouquet.id)].reduce(
              (h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0,
              0,
            ),
          ),
        ),
        bouquet_name: lb.bouquet.name,
      }));
      return j(rows);
    }
    default:
      return j(await xtreamUserInfo(line, baseUrl, userAgent));
  }
}
