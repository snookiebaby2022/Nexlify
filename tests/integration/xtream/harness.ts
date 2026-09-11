/**
 * In-memory Xtream API harness — no Postgres/Redis/network/FFmpeg.
 * Mirrors player_api / get.php / xmltv / live-auth wire contracts for integration tests.
 */
export const LineStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  BANNED: "BANNED",
  EXPIRED: "EXPIRED",
} as const;

export type FixtureLine = {
  id: string;
  username: string;
  password: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  maxConnections: number;
  bouquets: { bouquet: { id: string; name: string; isActive: boolean } }[];
};

export type FixtureStream = {
  id: string;
  name: string;
  type: "LIVE" | "MOVIE" | "SERIES";
  categoryId: string;
  categoryName: string;
  streamUrl: string;
  streamIcon: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  epgChannelId: string | null;
  channelId: string | null;
  bouquetIds: string[];
  containerExtension: string | null;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
};

type Conn = { lineId: string; ip: string; streamId: string; lastSeenAt: number };

export const state = {
  linesByCred: new Map<string, FixtureLine>(),
  liveConnections: [] as Conn[],
  streams: [] as FixtureStream[],
  epgPrograms: [] as {
    channelId: string;
    title: string;
    description: string;
    start: Date;
    end: Date;
  }[],
  nowMs: Date.now(),
};

export function setNow(ms: number) {
  state.nowMs = ms;
}

export function resetState() {
  state.linesByCred.clear();
  state.liveConnections = [];
  state.streams = [];
  state.epgPrograms = [];
  state.nowMs = Date.now();
}

export function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) {
    h = (Math.imul(31, h) + String(id).charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

export function makeLine(overrides: Partial<FixtureLine> = {}): FixtureLine {
  const now = state.nowMs;
  return {
    id: overrides.id ?? "line_test_1",
    username: overrides.username ?? "xtream_user",
    password: overrides.password ?? "xtream_pass",
    status: overrides.status ?? LineStatus.ACTIVE,
    expiresAt: overrides.expiresAt ?? new Date(now + 30 * 86400000),
    createdAt: overrides.createdAt ?? new Date(now - 86400000),
    maxConnections: overrides.maxConnections ?? 1,
    bouquets: overrides.bouquets ?? [
      { bouquet: { id: "bq_assigned", name: "Assigned Bouquet", isActive: true } },
    ],
  };
}

export function registerLine(line: Partial<FixtureLine>): FixtureLine {
  const full = makeLine(line);
  state.linesByCred.set(`${full.username}\0${full.password}`, full);
  return full;
}

export function lineIsPlayable(line: Pick<FixtureLine, "status" | "expiresAt"> | null): boolean {
  if (!line) return false;
  if (line.status === LineStatus.BANNED || line.status === LineStatus.DISABLED) return false;
  const exp = line.expiresAt instanceof Date ? line.expiresAt : new Date(line.expiresAt);
  // Production: expiresAt < now → EXPIRED (equal second remains playable).
  if (exp && exp.getTime() < state.nowMs) return false;
  if (line.status === LineStatus.EXPIRED) return false;
  return line.status === LineStatus.ACTIVE;
}

export function streamsForBouquet(line: FixtureLine, type: FixtureStream["type"]): FixtureStream[] {
  const bq = new Set((line.bouquets ?? []).map((lb) => lb.bouquet.id));
  return state.streams.filter(
    (s) => s.type === type && s.isActive && s.bouquetIds.some((id) => bq.has(id))
  );
}

export function seedDefaultCatalog() {
  resetState();
  const t = state.nowMs;
  const liveIn: FixtureStream = {
    id: "stream_live_in",
    name: "Sky Sports Main Event",
    type: "LIVE",
    categoryId: "cat_live_1",
    categoryName: "Sports",
    streamUrl: "http://127.0.0.1/mock/live.ts",
    streamIcon: "http://127.0.0.1/mock/logo.png",
    isActive: true,
    createdAt: new Date(t - 5000),
    updatedAt: new Date(t - 1000),
    epgChannelId: "sky.sports.main",
    channelId: "sky.sports.main",
    bouquetIds: ["bq_assigned"],
    containerExtension: null,
    seriesName: null,
    seasonNum: null,
    episodeNum: null,
  };
  const liveOut: FixtureStream = {
    ...liveIn,
    id: "stream_live_out",
    name: "Other Bouquet Channel",
    epgChannelId: "other.ch",
    channelId: "other.ch",
    bouquetIds: ["bq_other"],
  };
  const movie: FixtureStream = {
    id: "stream_movie_1",
    name: "Test Movie",
    type: "MOVIE",
    categoryId: "cat_vod_1",
    categoryName: "Movies",
    streamUrl: "http://127.0.0.1/mock/movie.mp4",
    streamIcon: "http://127.0.0.1/mock/movie.png",
    isActive: true,
    createdAt: new Date(t - 4000),
    updatedAt: new Date(t - 1000),
    epgChannelId: null,
    channelId: null,
    bouquetIds: ["bq_assigned"],
    containerExtension: "mp4",
    seriesName: null,
    seasonNum: null,
    episodeNum: null,
  };
  const episode: FixtureStream = {
    id: "stream_ep_1",
    name: "S01E01 Pilot",
    type: "SERIES",
    categoryId: "cat_series_1",
    categoryName: "Series",
    streamUrl: "http://127.0.0.1/mock/ep1.mkv",
    streamIcon: "http://127.0.0.1/mock/series.png",
    isActive: true,
    createdAt: new Date(t - 3000),
    updatedAt: new Date(t - 1000),
    epgChannelId: null,
    channelId: null,
    bouquetIds: ["bq_assigned"],
    containerExtension: "mkv",
    seriesName: "Test Series",
    seasonNum: 1,
    episodeNum: 1,
  };
  state.streams.push(liveIn, liveOut, movie, episode);
  state.epgPrograms.push({
    channelId: "sky.sports.main",
    title: "Live Match",
    description: "Football",
    start: new Date(t - 1_800_000),
    end: new Date(t + 1_800_000),
  });
  const line = registerLine({
    username: "xtream_user",
    password: "xtream_pass",
    maxConnections: 1,
  });
  return { line, liveIn, liveOut, movie, episode };
}

export function unauthPayload() {
  return {
    user_info: {
      auth: 0 as const,
      status: "Disabled",
      message: "",
      username: "",
      password: "",
      exp_date: null,
      is_trial: "0",
      active_cons: "0",
      created_at: null,
      max_connections: "0",
      allowed_output_formats: [] as string[],
    },
    server_info: {
      url: "panel.test",
      port: "80",
      https_port: "80",
      server_protocol: "http",
      rtmp_port: "0",
      timezone: "UTC",
      timestamp_now: Math.floor(state.nowMs / 1000),
      time_now: "12:00:00",
    },
  };
}

export function userInfoPayload(line: FixtureLine, baseUrl = "http://panel.test") {
  const playable = lineIsPlayable(line);
  const active = state.liveConnections.filter(
    (c) => c.lineId === line.id && c.lastSeenAt > state.nowMs - 120_000
  ).length;
  return {
    user_info: {
      username: line.username,
      password: line.password,
      epg_url: `${baseUrl}/xmltv.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`,
      offline_image_url: "",
      message: playable ? "" : "Account inactive or expired",
      auth: playable ? 1 : 0,
      status: playable ? "Active" : "Disabled",
      exp_date: String(Math.floor(new Date(line.expiresAt).getTime() / 1000)),
      is_trial: "0",
      active_cons: String(active),
      created_at: String(Math.floor(new Date(line.createdAt).getTime() / 1000)),
      max_connections: String(line.maxConnections > 0 ? Math.floor(line.maxConnections) : 0),
      allowed_output_formats: ["m3u8", "ts"],
      allowed_outputs: ["m3u8", "ts"],
    },
    server_info: {
      url: "panel.test",
      port: "80",
      https_port: "443",
      server_protocol: "http",
      rtmp_port: "0",
      timezone: "UTC",
      time_format: "H:i:s",
      date_format: "Y-m-d",
      datetime_format: "Y-m-d H:i:s",
      timestamp_now: Math.floor(state.nowMs / 1000),
      time_now: "12:00:00",
      time: "12:00:00",
      allowed_output_formats: ["m3u8", "ts"],
      abr_auto_switch: 0,
      abr_hint: "",
      epg_url: `${baseUrl}/xmltv.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`,
      offline_image_url: "",
    },
  };
}

function liveItem(s: FixtureStream, index: number) {
  return {
    num: index + 1,
    name: s.name,
    title: s.name,
    stream_display_name: s.name,
    stream_type: "live" as const,
    stream_id: cuidToNum(s.id),
    stream_icon: s.streamIcon || "",
    thumbnail: s.streamIcon || "",
    epg_channel_id: s.epgChannelId || "",
    epg_id: s.epgChannelId || "",
    added: String(Math.floor(s.createdAt.getTime() / 1000)),
    category_id: String(cuidToNum(s.categoryId)),
    category_ids: [String(cuidToNum(s.categoryId))],
    custom_sid: "",
    is_adult: 0,
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
    updated_at: Math.floor(s.updatedAt.getTime() / 1000),
  };
}

function vodItem(s: FixtureStream, index: number) {
  return {
    num: index + 1,
    name: s.name,
    stream_type: "movie" as const,
    stream_id: cuidToNum(s.id),
    stream_icon: s.streamIcon || "",
    movie_image: s.streamIcon || "",
    rating: "7.5",
    rating_5based: 3.75,
    added: String(Math.floor(s.createdAt.getTime() / 1000)),
    updated_at: Math.floor(s.updatedAt.getTime() / 1000),
    last_modified: String(Math.floor(s.updatedAt.getTime() / 1000)),
    is_adult: 0,
    category_id: String(cuidToNum(s.categoryId)),
    category_ids: [String(cuidToNum(s.categoryId))],
    container_extension: s.containerExtension || "mp4",
    custom_sid: "",
    direct_source: "",
  };
}

function seriesItem(s: FixtureStream, index: number) {
  return {
    num: index + 1,
    name: s.seriesName || s.name,
    series_id: cuidToNum(s.id),
    cover: s.streamIcon || "",
    plot: "Pilot episode",
    cast: "",
    director: "",
    genre: s.categoryName || "",
    releaseDate: "",
    last_modified: String(Math.floor(s.updatedAt.getTime() / 1000)),
    rating: "0",
    rating_5based: 0,
    backdrop_path: [] as string[],
    youtube_trailer: "",
    episode_run_time: "0",
    category_id: String(cuidToNum(s.categoryId)),
  };
}

export function emptySeriesInfo() {
  return {
    seasons: [] as { season_number: number; name: string; cover: string }[],
    info: {
      name: "",
      cover: "",
      plot: "",
      cast: "",
      director: "",
      genre: "",
      releaseDate: "",
      last_modified: "0",
      rating: "0",
      rating_5based: 0,
      backdrop_path: [] as string[],
      youtube_trailer: "",
      episode_run_time: "0",
      category_id: "0",
    },
    episodes: {} as Record<string, unknown[]>,
  };
}

/** player_api.php action dispatcher (credential + catalog contract). */
export function handlePlayerApi(params: URLSearchParams, baseUrl = "http://panel.test") {
  const username = params.get("username") ?? params.get("user");
  const password = params.get("password") ?? params.get("pass");
  const action = params.get("action");

  if (!username || !password) return unauthPayload();
  const line = state.linesByCred.get(`${username}\0${password}`);
  if (!line) return unauthPayload();

  if (!action) return userInfoPayload(line, baseUrl);

  switch (action) {
    case "get_live_categories": {
      const cats = new Map<string, object>();
      for (const s of streamsForBouquet(line, "LIVE")) {
        cats.set(s.categoryId, {
          category_id: String(cuidToNum(s.categoryId)),
          category_name: s.categoryName,
          parent_id: 0,
          created_at: "0",
        });
      }
      return [...cats.values()];
    }
    case "get_live_streams":
      return streamsForBouquet(line, "LIVE").map((s, i) => liveItem(s, i));
    case "get_vod_categories": {
      const cats = new Map<string, object>();
      for (const s of streamsForBouquet(line, "MOVIE")) {
        cats.set(s.categoryId, {
          category_id: String(cuidToNum(s.categoryId)),
          category_name: s.categoryName,
          parent_id: 0,
          created_at: "0",
        });
      }
      return [...cats.values()];
    }
    case "get_vod_streams":
      return streamsForBouquet(line, "MOVIE").map((s, i) => vodItem(s, i));
    case "get_vod_info": {
      const vodId = params.get("vod_id") || params.get("stream_id") || "";
      if (!vodId) return {};
      const s = streamsForBouquet(line, "MOVIE").find(
        (x) => x.id === vodId || String(cuidToNum(x.id)) === String(vodId)
      );
      if (!s) return {};
      return {
        info: {
          movie_image: s.streamIcon || "",
          tmdb_id: "",
          backdrop: "",
          youtube_trailer: "",
          genre: s.categoryName || "",
          plot: "A test plot",
          cast: "",
          rating: "7.5",
          director: "",
          releasedate: "",
          duration_secs: 0,
          duration: "",
          bitrate: 0,
          video: {},
          audio: {},
        },
        movie_data: {
          stream_id: cuidToNum(s.id),
          name: s.name,
          added: String(Math.floor(s.createdAt.getTime() / 1000)),
          category_id: String(cuidToNum(s.categoryId)),
          container_extension: s.containerExtension || "mp4",
          custom_sid: "",
          direct_source: "",
        },
      };
    }
    case "get_series":
      return streamsForBouquet(line, "SERIES").map((s, i) => seriesItem(s, i));
    case "get_series_info": {
      const seriesId = params.get("series_id") || params.get("stream_id") || "";
      if (!seriesId) return emptySeriesInfo();
      const s = streamsForBouquet(line, "SERIES").find(
        (x) => x.id === seriesId || String(cuidToNum(x.id)) === String(seriesId)
      );
      if (!s) return emptySeriesInfo();
      return {
        seasons: [{ season_number: 1, name: "Season 1", cover: s.streamIcon || "" }],
        info: {
          name: s.seriesName || s.name,
          cover: s.streamIcon || "",
          plot: "Pilot episode",
          cast: "",
          director: "",
          genre: s.categoryName || "",
          releaseDate: "",
          last_modified: String(Math.floor(s.updatedAt.getTime() / 1000)),
          rating: "0",
          rating_5based: 0,
          backdrop_path: [],
          youtube_trailer: "",
          episode_run_time: "0",
          category_id: String(cuidToNum(s.categoryId)),
        },
        episodes: {
          "1": [
            {
              id: cuidToNum(s.id),
              stream_id: cuidToNum(s.id),
              episode_num: s.episodeNum || 1,
              title: s.name,
              container_extension: s.containerExtension || "mkv",
              info: { movie_image: s.streamIcon || "", plot: "Pilot episode" },
              custom_sid: "",
              added: String(Math.floor(s.createdAt.getTime() / 1000)),
              season: 1,
              direct_source: "",
            },
          ],
        },
      };
    }
    case "get_short_epg":
    case "get_simple_data_table": {
      const streamId = params.get("stream_id") || "";
      if (!streamId) return { epg_listings: [] as unknown[] };
      const s = streamsForBouquet(line, "LIVE").find(
        (x) => x.id === streamId || String(cuidToNum(x.id)) === String(streamId)
      );
      if (!s) return { epg_listings: [] as unknown[] };
      const listings = state.epgPrograms
        .filter((p) => p.channelId === s.epgChannelId)
        .map((p) => ({
          id: "1",
          epg_id: s.epgChannelId,
          title: Buffer.from(p.title).toString("base64"),
          lang: "en",
          start: String(Math.floor(p.start.getTime() / 1000)),
          end: String(Math.floor(p.end.getTime() / 1000)),
          description: Buffer.from(p.description || "").toString("base64"),
          channel_id: s.epgChannelId,
          start_timestamp: String(Math.floor(p.start.getTime() / 1000)),
          stop_timestamp: String(Math.floor(p.end.getTime() / 1000)),
        }));
      return { epg_listings: listings };
    }
    case "get_account_info":
    case "get_user_info":
      return userInfoPayload(line, baseUrl);
    default:
      return userInfoPayload(line, baseUrl);
  }
}

export function authorizeGetPhp(username: string | null, password: string | null) {
  if (!username || !password) return { error: { status: 400, body: "Missing credentials" } };
  const line = state.linesByCred.get(`${username}\0${password}`);
  if (!line || !lineIsPlayable(line)) return { error: { status: 401, body: "Unauthorized" } };
  return { line };
}

export function buildM3u(line: FixtureLine, baseUrl: string, output: "ts" | "hls" = "ts") {
  const out: string[] = ["#EXTM3U"];
  for (const s of streamsForBouquet(line, "LIVE")) {
    const logo = s.streamIcon ? ` tvg-logo="${s.streamIcon}"` : "";
    out.push(
      `#EXTINF:-1 tvg-id="${s.epgChannelId || ""}" tvg-name="${s.name}" channel-id="${s.channelId || ""}"${logo} group-title="${s.categoryName || "Live"}",${s.name}`
    );
    const ext = output === "hls" ? "m3u8" : "ts";
    out.push(`${baseUrl}/live/${line.username}/${line.password}/${s.id}.${ext}`);
  }
  for (const s of streamsForBouquet(line, "MOVIE")) {
    out.push(
      `#EXTINF:-1 tvg-id="" tvg-name="${s.name}" channel-id="" tvg-logo="${s.streamIcon || ""}" group-title="${s.categoryName || "Movies"}",${s.name}`
    );
    out.push(
      `${baseUrl}/movie/${line.username}/${line.password}/${s.id}.${s.containerExtension || "mp4"}`
    );
  }
  return `${out.join("\n")}\n`;
}

export function buildXmltv(line: FixtureLine) {
  const channels = streamsForBouquet(line, "LIVE");
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    '<tv generator-info-name="Xtream Codes" generator-info-url="">',
  ];
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
  };
  for (const s of channels) {
    const epgId = s.epgChannelId || s.id;
    parts.push(`  <channel id="${epgId}">`);
    parts.push(`    <display-name>${s.name}</display-name>`);
    parts.push("  </channel>");
  }
  for (const s of channels) {
    const epgId = s.epgChannelId || s.id;
    for (const p of state.epgPrograms.filter((x) => x.channelId === epgId)) {
      parts.push(`  <programme start="${fmt(p.start)}" stop="${fmt(p.end)}" channel="${epgId}">`);
      parts.push(`    <title>${p.title}</title>`);
      parts.push(`    <desc>${p.description || ""}</desc>`);
      parts.push("  </programme>");
    }
  }
  parts.push("</tv>");
  return parts.join("\n");
}

export function connectionCapacityAllows(
  activeSessionCount: number,
  maxConnections: number,
  sameIpDistinctSessions: number,
  clientIp?: string | null,
  sameStreamReconnect = false
): boolean {
  if (maxConnections <= 0) return true;
  if (sameStreamReconnect) return true;
  if (activeSessionCount < maxConnections) return true;
  if (!clientIp) return false;
  return sameIpDistinctSessions > 0;
}

export function hasCapacity(
  lineId: string,
  maxConnections: number,
  opts: { streamId?: string; clientIp?: string } = {}
) {
  if (maxConnections <= 0) return true;
  const staleBefore = state.nowMs - 120_000;
  const rows = state.liveConnections.filter(
    (c) => c.lineId === lineId && c.lastSeenAt >= staleBefore
  );
  const active = new Set(rows.map((r) => `${r.ip}|${r.streamId}`)).size;
  const clientRows = opts.clientIp ? rows.filter((r) => r.ip === opts.clientIp) : [];
  const sameIpStreams = new Set(clientRows.map((r) => r.streamId));
  const sameStreamReconnect = Boolean(opts.streamId && sameIpStreams.has(opts.streamId));
  return connectionCapacityAllows(
    active,
    maxConnections,
    sameIpStreams.size,
    opts.clientIp,
    sameStreamReconnect
  );
}

export function authorizeLive(
  username: string,
  password: string,
  streamId: string,
  clientIp: string
) {
  const line = state.linesByCred.get(`${username}\0${password}`);
  if (!line) return { status: 401 as const, body: "Unauthorized" };
  if (!lineIsPlayable(line)) return { status: 403 as const, body: "Unauthorized" };
  const stream =
    state.streams.find((s) => s.id === streamId || String(cuidToNum(s.id)) === String(streamId)) ||
    null;
  if (!stream) return { status: 404 as const, body: "Not found" };
  const bq = new Set((line.bouquets ?? []).map((lb) => lb.bouquet.id));
  if (!stream.bouquetIds.some((id) => bq.has(id))) return { status: 404 as const, body: "Not found" };
  if (!hasCapacity(line.id, line.maxConnections, { streamId: stream.id, clientIp })) {
    return { status: 403 as const, body: "Max connections reached" };
  }
  return { status: 200 as const, line, stream };
}
