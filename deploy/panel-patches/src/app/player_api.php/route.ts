import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import {
  serverBaseUrl,
  xtreamUserInfo,
  xtreamLiveStreams,
  xtreamVodStreams,
} from "@/lib/xtream";
import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";
import { getShortEpg } from "@/lib/epg";
import { excludeDisabledFromExport } from "@/lib/export-policy";
import { getAntiFreezeSettings, schedulePlaylistZapWarm } from "@/lib/anti-freeze";
import { StreamType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  const action = req.nextUrl.searchParams.get("action");

  if (!username || !password) {
    return NextResponse.json({ error: "credentials required" }, { status: 400 });
  }

  const line = await getLineByCredentials(username, password);
  if (!line) {
    return NextResponse.json(
      { user_info: { auth: 0, message: "Invalid credentials" } },
      { status: 401 }
    );
  }

  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined
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
                    : "Playback denied";
    return NextResponse.json(
      { user_info: { auth: 0, message: msg } },
      { status: deny === "rate" ? 429 : 403 }
    );
  }

  const baseUrl = serverBaseUrl(req.url, req.headers);

  if (!action) {
    return NextResponse.json(xtreamUserInfo(line, baseUrl));
  }

  switch (action) {
    case "get_live_categories": {
      const exclude = await excludeDisabledFromExport();
      const payload = await cacheGetOrSet(`xtream:live_categories:${exclude}`, 120, async () => {
        const cats = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
        if (!exclude) {
          return cats.map((c) => ({
            category_id: c.id,
            category_name: c.name,
            parent_id: 0,
          }));
        }
        const used = await prisma.stream.findMany({
          where: { isActive: true, type: StreamType.LIVE, categoryId: { not: null } },
          select: { categoryId: true },
          distinct: ["categoryId"],
        });
        const ids = new Set(used.map((s) => s.categoryId).filter(Boolean) as string[]);
        return cats
          .filter((c) => ids.has(c.id))
          .map((c) => ({
            category_id: c.id,
            category_name: c.name,
            parent_id: 0,
          }));
      });
      return NextResponse.json(payload);
    }
    case "get_live_streams": {
      const payload = await xtreamLiveStreams(line);
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
      return NextResponse.json(payload);
    }
    case "get_vod_streams":
      return NextResponse.json(await xtreamVodStreams(line, baseUrl));
    case "get_vod_categories":
      return NextResponse.json([]);
    case "get_series_categories":
      return NextResponse.json([]);
    case "get_series":
      return NextResponse.json([]);
    case "get_short_epg": {
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return NextResponse.json([]);
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      const channelId = stream?.epgChannelId ?? streamId;
      const epg = await getShortEpg(channelId);
      return NextResponse.json({ epg_listings: { [streamId]: epg } });
    }
    case "get_simple_data_table": {
      const streamId = req.nextUrl.searchParams.get("stream_id");
      if (!streamId) return NextResponse.json([]);
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      const channelId = stream?.epgChannelId ?? streamId;
      return NextResponse.json(await getShortEpg(channelId, 10));
    }
    default:
      return NextResponse.json(xtreamUserInfo(line, baseUrl));
  }
}
