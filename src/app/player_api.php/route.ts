import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import {
  serverBaseUrl,
  xtreamUserInfo,
  xtreamLiveStreams,
  xtreamLiveCategoriesForLine,
  xtreamVodStreams,
  xtreamVodCategoriesForLine,
  xtreamSeriesForLine,
  xtreamSeriesCategoriesForLine,
} from "@/lib/xtream";
import { xtreamVodInfo, xtreamSeriesInfo } from "@/lib/xtream-info";
import { cuidToNum, resolveStreamIdParam } from "@/lib/xtream-stream-id";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { checkDdosShield } from "@/lib/ddos-shield";
import { cacheGet, cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { getShortEpgForChannelIds } from "@/lib/epg";
import { streamHasArchive } from "@/lib/catchup-playback-url";
import { getAntiFreezeSettings, schedulePlaylistZapWarm } from "@/lib/anti-freeze";
import { iptvCorsPreflight, iptvJson } from "@/lib/iptv-cors";
import { xtreamDeltaArray } from "@/lib/xtream-safe";
import { resolveClientPlaybackProfile } from "@/lib/client-playback-profiles";
import { prisma } from "@/lib/prisma";
import { warmLineXmltv } from "@/lib/xmltv-export";

function xtreamEpgStreamParam(req: NextRequest): string {
  return (
    req.nextUrl.searchParams.get("stream_id") ||
    req.nextUrl.searchParams.get("channel_id") ||
    req.nextUrl.searchParams.get("epg_channel_id") ||
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

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  /** Gzip large Xtream catalog JSON when clients send Accept-Encoding: gzip. */
  const j = (data: unknown, init?: ResponseInit) =>
    iptvJson(data, { ...init, compressFor: req });

  const ip = getClientIp(req);
  const ddos = await checkDdosShield(ip);
  if (!ddos.ok) {
    return j({ error: ddos.reason }, { status: 429 });
  }

  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  const action = req.nextUrl.searchParams.get("action");
  const timestampParam = req.nextUrl.searchParams.get("timestamp");
  const clientTimestamp = timestampParam ? Number(timestampParam) : null;

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

  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined,
    { listingOnly: true }
  );
  if (deny) {
    const msg =
      deny === "ip"
        ? "IP not allowed for this line"
        : deny === "connections"
          ? "Max connections reached"
          : deny === "rate"
            ? "Rate limit exceeded"
            : deny === "blocklist"
              ? "Access blocked"
              : deny === "country"
                ? "Country not allowed"
                : deny === "vpn"
                  ? "VPN or hosting not allowed"
                  : deny === "user_agent"
                    ? "User-Agent not allowed for this line"
                    : deny === "ddos"
                      ? "Access temporarily blocked (DDoS shield)"
                    : "Playback denied";
    return j(
      { user_info: { auth: 0, message: msg } },
      { status: deny === "rate" || deny === "ddos" ? 429 : 403 }
    );
  }

  const baseUrl = serverBaseUrl(req.url, req.headers);
  const userAgent = req.headers.get("user-agent");

  if (!action) {
    return j(await xtreamUserInfo(line, baseUrl, userAgent));
  }

  switch (action) {
    case "get_live_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:live_categories:v5:${line.id}`, ttl.categories, () =>
        xtreamLiveCategoriesForLine(line)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (c) => Number(c.created_at || 0)));
    }
    case "get_live_streams": {
      const categoryId = req.nextUrl.searchParams.get("category_id");
      const ttl = await getCacheTtls();
      const cacheKey = `xtream:live_streams:v5:${line.id}:${categoryId ?? "all"}`;
      const cached = await cacheGet<Awaited<ReturnType<typeof xtreamLiveStreams>>>(cacheKey);
      const payload =
        cached ??
        (await cacheGetOrSet(cacheKey, Math.min(ttl.categories || 60, 90), () =>
          xtreamLiveStreams(line, baseUrl, categoryId)
        ));
      const profile = resolveClientPlaybackProfile(userAgent);
      if (!cached && profile.zapPrefetchOnPlaylist) {
        void getAntiFreezeSettings().then((antiFreeze) => {
          if (!antiFreeze.zapPrefetchOnPlaylist) return;
          schedulePlaylistZapWarm(
            line.id,
            payload.map((s) => String(s.stream_id)),
            { clientIp: getClientIp(req), userAgent: userAgent ?? undefined },
            antiFreeze
          );
        });
      }
      // XCIPTV downloads xmltv after Update Content — start the cache fill now.
      warmLineXmltv(line);
      return j(xtreamDeltaArray(payload, clientTimestamp, (s) => s.updated_at ?? 0));
    }
    case "get_vod_streams": {
      const vodCategoryId = req.nextUrl.searchParams.get("category_id");
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:vod_streams:v3:${line.id}:${vodCategoryId ?? "all"}`,
        Math.min(ttl.categories || 60, 90),
        () => xtreamVodStreams(line, baseUrl, vodCategoryId)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (s) => s.updated_at ?? 0));
    }
    case "get_vod_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:vod_categories:v3:${line.id}`, ttl.categories, () =>
        xtreamVodCategoriesForLine(line)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (c) => Number(c.created_at || 0)));
    }
    case "get_series_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:series_categories:v3:${line.id}`, ttl.categories, () =>
        xtreamSeriesCategoriesForLine(line)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (c) => Number(c.created_at || 0)));
    }
    case "get_series": {
      const seriesCategoryId = req.nextUrl.searchParams.get("category_id");
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(
        `xtream:series:v3:${line.id}:${seriesCategoryId ?? "all"}`,
        Math.min(ttl.categories || 60, 90),
        () => xtreamSeriesForLine(line, seriesCategoryId)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (s) => Number(s.last_modified) || 0));
    }
    case "get_vod_info": {
      const vodId =
        req.nextUrl.searchParams.get("vod_id") ||
        req.nextUrl.searchParams.get("stream_id") ||
        "";
      if (!vodId) return j({});
      const info = await xtreamVodInfo(line, baseUrl, vodId);
      return j(info ?? {});
    }
    case "get_series_info": {
      const seriesId =
        req.nextUrl.searchParams.get("series_id") ||
        req.nextUrl.searchParams.get("stream_id") ||
        "";
      if (!seriesId) return j({});
      const info = await xtreamSeriesInfo(line, baseUrl, seriesId);
      return j(info ?? {});
    }
    case "get_short_epg": {
      const streamId = xtreamEpgStreamParam(req);
      if (!streamId) return j({ epg_listings: [] });
      const epg = await resolveXtreamEpgListings(line.id, streamId, 4);
      return j({ epg_listings: epg });
    }
    case "get_epg": {
      const streamId = xtreamEpgStreamParam(req);
      if (!streamId) return j({ epg_listings: [] });
      const limit = Math.min(
        500,
        Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50)
      );
      const epg = await resolveXtreamEpgListings(line.id, streamId, limit);
      return j({ epg_listings: epg });
    }
    case "get_simple_data_table": {
      const streamId = xtreamEpgStreamParam(req);
      if (!streamId) return j({ epg_listings: [] });
      return j({ epg_listings: await resolveXtreamEpgListings(line.id, streamId, 10) });
    }
    case "get_user_info":
      return j(await xtreamUserInfo(line, baseUrl, userAgent));
    case "get_server_info": {
      const payload = await xtreamUserInfo(line, baseUrl, userAgent);
      return j(payload);
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

