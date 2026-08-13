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
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { checkDdosShield } from "@/lib/ddos-shield";
import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { getShortEpg } from "@/lib/epg";
import { getAntiFreezeSettings, schedulePlaylistZapWarm } from "@/lib/anti-freeze";
import { iptvCorsPreflight, iptvJson } from "@/lib/iptv-cors";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const ip = getClientIp(req);
  const ddos = await checkDdosShield(ip);
  if (!ddos.ok) {
    return iptvJson({ error: ddos.reason }, { status: 429 });
  }

  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  const action = req.nextUrl.searchParams.get("action");
  const timestampParam = req.nextUrl.searchParams.get("timestamp");
  const clientTimestamp = timestampParam ? Number(timestampParam) : null;

  if (!username || !password) {
    return iptvJson({ error: "credentials required" }, { status: 400 });
  }

  const line = await getLineByCredentials(username, password);
  if (!line) {
    return iptvJson(
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
    return iptvJson(
      { user_info: { auth: 0, message: msg } },
      { status: deny === "rate" || deny === "ddos" ? 429 : 403 }
    );
  }

  const baseUrl = serverBaseUrl(req.url, req.headers);

  if (!action) {
    return iptvJson(await xtreamUserInfo(line, baseUrl));
  }

  switch (action) {
    case "get_live_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:live_categories:${line.id}`, ttl.categories, () =>
        xtreamLiveCategoriesForLine(line)
      );
      if (clientTimestamp && clientTimestamp > 0) {
        const filtered = payload.filter(
          (c) => Number(c.created_at || 0) > clientTimestamp
        );
        return iptvJson({ categories: filtered, changed: filtered.length, server_timestamp: Math.floor(Date.now() / 1000) });
      }
      return iptvJson(payload);
    }
    case "get_live_streams": {
      const categoryId = req.nextUrl.searchParams.get("category_id");
      const payload = await xtreamLiveStreams(line, baseUrl, categoryId);
      const antiFreeze = await getAntiFreezeSettings();
      if (antiFreeze.zapPrefetchOnPlaylist) {
        const ids = payload.map((s) => String(s.stream_id));
        schedulePlaylistZapWarm(
          line.id,
          ids,
          { clientIp: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined },
          antiFreeze
        );
      }
      if (clientTimestamp && clientTimestamp > 0) {
        const filtered = payload.filter(
          (s) => (s.updated_at ?? 0) > clientTimestamp
        );
        return iptvJson({ streams: filtered, changed: filtered.length, server_timestamp: Math.floor(Date.now() / 1000) });
      }
      return iptvJson(payload);
    }
    case "get_vod_streams": {
      const vodCategoryId = req.nextUrl.searchParams.get("category_id");
      const payload = await xtreamVodStreams(line, baseUrl, vodCategoryId);
      if (clientTimestamp && clientTimestamp > 0) {
        const filtered = payload.filter(
          (s) => (s.updated_at ?? 0) > clientTimestamp
        );
        return iptvJson({ streams: filtered, changed: filtered.length, server_timestamp: Math.floor(Date.now() / 1000) });
      }
      return iptvJson(payload);
    }
    case "get_vod_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:vod_categories:${line.id}`, ttl.categories, () =>
        xtreamVodCategoriesForLine(line)
      );
      if (clientTimestamp && clientTimestamp > 0) {
        const filtered = payload.filter(
          (c) => Number(c.created_at || 0) > clientTimestamp
        );
        return iptvJson({ categories: filtered, changed: filtered.length, server_timestamp: Math.floor(Date.now() / 1000) });
      }
      return iptvJson(payload);
    }
    case "get_series_categories": {
      const ttl = await getCacheTtls();
      const payload = await cacheGetOrSet(`xtream:series_categories:${line.id}`, ttl.categories, () =>
        xtreamSeriesCategoriesForLine(line)
      );
      if (clientTimestamp && clientTimestamp > 0) {
        const filtered = payload.filter(
          (c) => Number(c.created_at || 0) > clientTimestamp
        );
        return iptvJson({ categories: filtered, changed: filtered.length, server_timestamp: Math.floor(Date.now() / 1000) });
      }
      return iptvJson(payload);
    }
    case "get_series": {
      const seriesCategoryId = req.nextUrl.searchParams.get("category_id");
      const payload = await xtreamSeriesForLine(line, seriesCategoryId);
      return iptvJson(payload);
    }
    case "get_short_epg": {
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return iptvJson([]);
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      const channelId = stream?.epgChannelId ?? streamId;
      const epg = await getShortEpg(channelId);
      return iptvJson({ epg_listings: epg });
    }
    case "get_simple_data_table": {
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return iptvJson([]);
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      const channelId = stream?.epgChannelId ?? streamId;
      return iptvJson(await getShortEpg(channelId, 10));
    }
    default:
      return iptvJson(await xtreamUserInfo(line, baseUrl));
  }
}
