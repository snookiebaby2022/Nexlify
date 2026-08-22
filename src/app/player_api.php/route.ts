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
import { resolveStreamIdParam } from "@/lib/xtream-stream-id";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { checkDdosShield } from "@/lib/ddos-shield";
import { cacheGet, cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { getShortEpg, getShortEpgForChannelIds } from "@/lib/epg";
import { streamHasArchive } from "@/lib/catchup-playback-url";
import { getAntiFreezeSettings, schedulePlaylistZapWarm } from "@/lib/anti-freeze";
import { iptvCorsPreflight, iptvJson } from "@/lib/iptv-cors";
import { xtreamDeltaArray } from "@/lib/xtream-safe";
import { resolveClientPlaybackProfile } from "@/lib/client-playback-profiles";
import { prisma } from "@/lib/prisma";

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

  if (!action) {
    return j(await xtreamUserInfo(line, baseUrl));
  }

  switch (action) {
    case "get_live_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:live_categories:v4:${line.id}`, ttl.categories, () =>
        xtreamLiveCategoriesForLine(line)
      );
      return j(xtreamDeltaArray(payload, clientTimestamp, (c) => Number(c.created_at || 0)));
    }
    case "get_live_streams": {
      const categoryId = req.nextUrl.searchParams.get("category_id");
      const ttl = await getCacheTtls();
      const cacheKey = `xtream:live_streams:v4:${line.id}:${categoryId ?? "all"}`;
      const cached = await cacheGet<Awaited<ReturnType<typeof xtreamLiveStreams>>>(cacheKey);
      const payload =
        cached ??
        (await cacheGetOrSet(cacheKey, Math.min(ttl.categories || 60, 90), () =>
          xtreamLiveStreams(line, baseUrl, categoryId)
        ));
      if (!cached) {
        const antiFreeze = await getAntiFreezeSettings();
        const profile = resolveClientPlaybackProfile(req.headers.get("user-agent"));
        if (antiFreeze.zapPrefetchOnPlaylist && profile.zapPrefetchOnPlaylist) {
          const ids = payload.map((s) => String(s.stream_id));
          schedulePlaylistZapWarm(
            line.id,
            ids,
            { clientIp: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined },
            antiFreeze
          );
        }
      }
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
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return j({ epg_listings: [] });
      const resolved = await resolveStreamIdParam(streamId, { lineId: line.id });
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
        ? [stream.epgChannelId, stream.channelId, stream.id, streamId].filter(
            (v): v is string => Boolean(v?.trim())
          )
        : [streamId];
      const archivable = stream ? streamHasArchive(stream) : false;
      const epg = await getShortEpgForChannelIds(channelIds, 4, archivable);
      return j({ epg_listings: epg });
    }
    case "get_simple_data_table": {
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return j({ epg_listings: [] });
      const resolved = await resolveStreamIdParam(streamId, { lineId: line.id });
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
        ? [stream.epgChannelId, stream.channelId, stream.id, streamId].filter(
            (v): v is string => Boolean(v?.trim())
          )
        : [streamId];
      const archivable = stream ? streamHasArchive(stream) : false;
      return j({ epg_listings: await getShortEpgForChannelIds(channelIds, 10, archivable) });
    }
    case "get_user_info":
      return j(await xtreamUserInfo(line, baseUrl));
    case "get_server_info": {
      const payload = await xtreamUserInfo(line, baseUrl);
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
      return j(await xtreamUserInfo(line, baseUrl));
  }
}

