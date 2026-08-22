import type { LineWithBouquets, StreamForLine, StreamsForLineOptions } from "./lines";
import {
  activeBouquetIds,
  categoryIdsForLine,
  lineIsPlayable,
  streamCountForLine,
  streamsForLineExport,
} from "./lines";
import { StreamType, Prisma } from "@prisma/client";
import { getBinPaths } from "./bin-paths";
import { prisma } from "./prisma";
import { expandCategoryFilter } from "./category-tree";
import { exportPlaybackUrl } from "./export-playback-url";
import { seriesSeedsForBouquets } from "./xtream-stream-id";
import {
  handleStalkerExtendedAction,
  STALKER_EXTENDED_ACTIONS,
} from "./stalker-portal-ext";
import {
  panelTimeshiftUrl,
  parseStalkerArchiveCmd,
  streamHasArchive,
} from "./catchup-playback-url";

export { STALKER_EXTENDED_ACTIONS };

/** Ministra / XUI default page size for get_ordered_list. */
export const STALKER_PAGE_SIZE = 14;

export function stalkerJsResponse(data: unknown) {
  return {
    js: data,
    text: "generated in API",
    html: "",
  };
}

function portalStreamType(portalType: string): StreamType {
  if (portalType === "vod") return StreamType.MOVIE;
  if (portalType === "series") return StreamType.SERIES;
  return StreamType.LIVE;
}

let stalkerCmdPrefixCache: string | null = null;

async function stalkerCmdPrefix(): Promise<string> {
  if (stalkerCmdPrefixCache) return stalkerCmdPrefixCache;
  const paths = await getBinPaths();
  stalkerCmdPrefixCache = `${paths.ffmpegPath.split(/[/\\]/).pop() ?? "ffmpeg"} `;
  return stalkerCmdPrefixCache;
}

function stalkerCmd(streamId: string, prefix: string): string {
  return `${prefix}${streamId}`;
}

function parsePage(extra: Record<string, string>): number {
  const raw = extra.page ?? extra.p ?? "0";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function categoryFilterOpts(
  genre: string
): Promise<Pick<StreamsForLineOptions, "categoryIds" | "uncategorizedOnly">> {
  if (!genre) return {};
  if (genre === "0") return { uncategorizedOnly: true };
  const allowed = await expandCategoryFilter(genre);
  return { categoryIds: allowed.length ? allowed : [genre] };
}

async function stalkerExportOpts(
  line: LineWithBouquets,
  portalType: string,
  extra: Record<string, string>
) {
  const { excludeDisabledFromExport } = await import("@/lib/export-policy");
  const excludeDisabled = await excludeDisabledFromExport();
  const genre = extra.genre ?? extra.category ?? "";
  const catOpts = await categoryFilterOpts(genre);
  return {
    type: portalStreamType(portalType),
    lean: true as const,
    excludeDisabled,
    ...catOpts,
  };
}

async function stalkerCategories(line: LineWithBouquets, portalType: string) {
  const streamType = portalStreamType(portalType);
  const { excludeDisabledFromExport } = await import("@/lib/export-policy");
  const excludeDisabled = await excludeDisabledFromExport();
  const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, {
    type: streamType,
    excludeDisabled,
  });
  const cats = categoryIds.length
    ? await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, sortOrder: true, isAdult: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const defaultTitle =
    streamType === StreamType.MOVIE
      ? "Movies"
      : streamType === StreamType.SERIES
        ? "Series"
        : "Live TV";
  const rows: { id: string; title: string; alias: string; censored: number; number: number }[] =
    [];
  let n = 1;
  if (hasUncategorized) {
    const nUncat = await streamCountForLine(line, {
      type: streamType,
      uncategorizedOnly: true,
      excludeDisabled,
    });
    if (nUncat > 0) {
      rows.push({ id: "0", title: defaultTitle, alias: "0", censored: 0, number: n++ });
    }
  }
  for (const c of cats) {
    rows.push({
      id: c.id,
      title: c.name,
      alias: c.id,
      censored: c.isAdult ? 1 : 0,
      number: n++,
    });
  }
  for (const id of categoryIds) {
    if (!byId.has(id) && !rows.some((r) => r.id === id)) {
      rows.push({ id, title: id, alias: id, censored: 0, number: n++ });
    }
  }
  if (!rows.length) {
    rows.push({ id: "0", title: defaultTitle, alias: "0", censored: 0, number: 1 });
  }
  return rows;
}

async function findStreamForLine(
  line: LineWithBouquets,
  streamId: string
): Promise<StreamForLine | null> {
  const bouquetIds = activeBouquetIds(line);
  if (!bouquetIds.length) return null;
  const stream = await prisma.stream.findFirst({
    where: {
      id: streamId,
      isActive: true,
      bouquets: { some: { bouquetId: { in: bouquetIds } } },
    },
    include: {
      provider: { select: { baseUrl: true } },
      server: { select: { host: true } },
    },
  });
  return stream as StreamForLine | null;
}

function listingRow(
  s: StreamForLine,
  i: number,
  page: number,
  prefix: string,
  extra?: Partial<{ cmd: string; is_series: number }>
) {
  const archived = streamHasArchive(s);
  return {
    id: s.id,
    name: s.name,
    number: String(page * STALKER_PAGE_SIZE + i + 1),
    censored: s.isAdult ? 1 : 0,
    cmd: extra?.cmd ?? stalkerCmd(s.id, prefix),
    is_series: extra?.is_series ?? 0,
    cost: 0,
    count: 0,
    status: 1,
    hd: 1,
    tv_genre_id: s.categoryId ?? "0",
    logo: s.streamIcon ?? "",
    modified: "",
    hasArchive: archived ? 1 : 0,
    archive: s.archiveDays ?? 0,
    allow_local_timeshift: (s.timeshiftSeconds ?? 0) > 0 ? 1 : 0,
  };
}

function pagedList(total: number, page: number, data: unknown[]) {
  return {
    total_items: total,
    max_page_items: STALKER_PAGE_SIZE,
    selected_item: 0,
    cur_page: page,
    data,
  };
}

async function orderedListForType(
  line: LineWithBouquets,
  portalType: string,
  extra: Record<string, string>
) {
  const page = parsePage(extra);
  const prefix = await stalkerCmdPrefix();
  const baseOpts = await stalkerExportOpts(line, portalType, extra);

  const total = await streamCountForLine(line, baseOpts);
  const streams = await streamsForLineExport(line, {
    ...baseOpts,
    offset: page * STALKER_PAGE_SIZE,
    limit: STALKER_PAGE_SIZE,
  });

  return stalkerJsResponse(
    pagedList(
      total,
      page,
      streams.map((s, i) => listingRow(s, i, page, prefix))
    )
  );
}

async function seriesEpisodeList(
  line: LineWithBouquets,
  extra: Record<string, string>
) {
  const seriesId = (extra.movie_id ?? extra.series_id ?? extra.id ?? "").replace(/^series:/i, "");
  const page = parsePage(extra);
  const prefix = await stalkerCmdPrefix();
  const seed = await prisma.stream.findUnique({
    where: { id: seriesId },
    select: { seriesName: true, name: true },
  });
  const seriesName = seed?.seriesName?.trim() || seed?.name?.trim() || "";
  const bouquetIds = activeBouquetIds(line);
  if (!bouquetIds.length || !seriesName) {
    return stalkerJsResponse(pagedList(0, page, []));
  }

  const episodes = await prisma.$queryRaw<
    { id: string; name: string; seasonNum: number | null; episodeNum: number | null; categoryId: string | null; streamIcon: string | null; isAdult: boolean }[]
  >`
    SELECT s.id, s.name, s."seasonNum", s."episodeNum", s."categoryId", s."streamIcon", s."isAdult"
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
      AND s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      AND lower(trim(coalesce(nullif(trim(s."seriesName"), ''), s.name))) = lower(${seriesName})
    ORDER BY coalesce(s."seasonNum", 0), coalesce(s."episodeNum", 0), s.name
    LIMIT ${STALKER_PAGE_SIZE} OFFSET ${page * STALKER_PAGE_SIZE}
  `;

  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT s.id)::bigint AS count
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
      AND s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      AND lower(trim(coalesce(nullif(trim(s."seriesName"), ''), s.name))) = lower(${seriesName})
  `;
  const total = Number(countRows[0]?.count ?? 0);

  return stalkerJsResponse(
    pagedList(
      total,
      page,
      episodes.map((s, i) =>
        listingRow(
          {
            id: s.id,
            name:
              s.seasonNum || s.episodeNum
                ? `S${s.seasonNum ?? 0}E${s.episodeNum ?? 0} · ${s.name}`
                : s.name,
            categoryId: s.categoryId,
            streamIcon: s.streamIcon,
            isAdult: s.isAdult,
          } as StreamForLine,
          i,
          page,
          prefix
        )
      )
    )
  );
}

async function seriesSeedList(line: LineWithBouquets, extra: Record<string, string>) {
  const genre = extra.genre ?? extra.category ?? "";
  const page = parsePage(extra);
  const bouquetIds = activeBouquetIds(line);
  let seeds = await seriesSeedsForBouquets(bouquetIds);
  if (genre && genre !== "0") {
    const allowed = new Set(await expandCategoryFilter(genre));
    seeds = seeds.filter((s) => s.categoryId && allowed.has(s.categoryId));
  } else if (genre === "0") {
    seeds = seeds.filter((s) => !s.categoryId);
  }
  const total = seeds.length;
  const slice = seeds.slice(page * STALKER_PAGE_SIZE, (page + 1) * STALKER_PAGE_SIZE);
  return stalkerJsResponse(
    pagedList(
      total,
      page,
      slice.map((s, i) => ({
        id: s.id,
        name: s.name,
        number: String(page * STALKER_PAGE_SIZE + i + 1),
        censored: 0,
        cmd: `series:${s.id}`,
        is_series: 1,
        cost: 0,
        count: 0,
        status: 1,
        hd: 1,
        tv_genre_id: s.categoryId ?? "0",
        logo: s.streamIcon ?? "",
        modified: "",
      }))
    )
  );
}

export async function handleStalkerAction(
  action: string,
  line: LineWithBouquets | null,
  baseUrl: string,
  extra: Record<string, string>
) {
  if (!line || !lineIsPlayable(line)) {
    if (!line && !extra.mac) {
      return stalkerJsResponse({ error: "Device MAC not sent", authorized: 0 });
    }
    if (!line && extra.mac) {
      return stalkerJsResponse({ error: "MAC not registered in panel", authorized: 0 });
    }
    return stalkerJsResponse({ error: "Account inactive", authorized: 0 });
  }

  const portalType = extra.portalType || "stb";

  switch (action) {
    case "handshake":
      return stalkerJsResponse({
        token: Buffer.from(`${line.id}:${Date.now()}`).toString("base64url"),
        random: Math.random().toString(36).slice(2),
        authorized: 1,
      });

    case "get_profile":
      return stalkerJsResponse({
        id: line.id,
        name: line.username,
        login: line.username,
        pass: line.password,
        parent_password: "",
        max_online: line.maxConnections,
        expires: Math.floor(line.expiresAt.getTime() / 1000),
        tariff_plan_id: "1",
        account_balance: "",
        status: 1,
      });

    case "get_main_info":
      return stalkerJsResponse({
        mac: extra.mac ?? "",
        phone: "",
        ls: "",
        version: "Nexlify Stalker Portal",
        lang: "en",
        storage_name: "",
        hd: 1,
        main_notify: 1,
        playserver: baseUrl.replace(/^https?:\/\//, ""),
        playback_limit: line.maxConnections,
        screensaver: "",
      });

    case "get_categories":
      return stalkerJsResponse(await stalkerCategories(line, portalType));

    case "get_ordered_list": {
      const seriesId = extra.movie_id ?? extra.series_id ?? "";
      if (portalType === "series" && seriesId) {
        return seriesEpisodeList(line, extra);
      }
      if (portalType === "series") {
        return seriesSeedList(line, extra);
      }
      return orderedListForType(line, portalType, extra);
    }

    case "create_link": {
      const cmd = extra.cmd ?? extra.id ?? "";
      const archive = parseStalkerArchiveCmd(cmd);
      if (archive) {
        const stream = await findStreamForLine(line, archive.streamId);
        if (!stream) {
          return stalkerJsResponse({ error: "Stream not found" });
        }
        if (!streamHasArchive(stream)) {
          return stalkerJsResponse({ error: "Archive not available for this channel" });
        }
        const url = panelTimeshiftUrl(
          baseUrl,
          line.username,
          line.password,
          stream.id,
          archive.startUnix,
          archive.durationSec
        );
        return stalkerJsResponse({ cmd: url, id: stream.id });
      }
      const streamId = cmd.replace(/^ffmpeg\s+/i, "").replace(/^series:/i, "").trim();
      const stream = await findStreamForLine(line, streamId);
      if (!stream) {
        return stalkerJsResponse({ error: "Stream not found" });
      }
      const url = exportPlaybackUrl(
        baseUrl,
        { username: line.username, password: line.password },
        stream,
        stream,
        undefined,
        "ts"
      );
      return stalkerJsResponse({ cmd: url, id: stream.id });
    }

    case "stop_link": {
      const cmd = extra.cmd ?? extra.id ?? extra.stream_id ?? "";
      const streamId = cmd.replace(/^ffmpeg\s+/i, "").replace(/^series:/i, "").trim();
      if (!streamId) {
        return stalkerJsResponse({ error: "Missing stream" });
      }
      const { removeConnection } = await import("@/lib/connections");
      await removeConnection(line.id, streamId, extra.clientIp ?? "");
      return stalkerJsResponse({ success: 1 });
    }

    default: {
      const extended = await handleStalkerExtendedAction(action, line, baseUrl, extra);
      if (extended !== null) return stalkerJsResponse(extended);
      return stalkerJsResponse({ error: `Unknown action: ${action}` });
    }
  }
}

export function resolveMacFromRequest(
  headers: Headers,
  params: URLSearchParams
): string | null {
  const fromParams =
    params.get("mac") ??
    params.get("Mac") ??
    params.get("device_id") ??
    params.get("device_mac");
  if (fromParams) return fromParams;

  const headerMac =
    headers.get("x-mac") ??
    headers.get("x-device-mac") ??
    headers.get("device-mac");
  if (headerMac) return headerMac;

  const cookie = headers.get("cookie") ?? "";
  const cookieMac = cookie.match(/(?:^|;\s*)mac=([0-9A-Fa-f:]+)/i)?.[1];
  if (cookieMac) return cookieMac;

  const xua = headers.get("x-user-agent") ?? headers.get("user-agent") ?? "";
  const xuaMac =
    xua.match(/\bmac[=:\s]+([0-9A-Fa-f:]{12,17})/i)?.[1] ??
    xua.match(/\b([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b/)?.[1];
  if (xuaMac) return xuaMac;

  return null;
}
