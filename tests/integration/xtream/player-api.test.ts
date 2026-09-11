/**
 * Xtream Codes API integration tests.
 * Uses production wire helpers where possible; in-memory harness covers
 * multi-step bouquet / max_connections / line-state flows without Postgres.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { LineStatus, StreamType } from "@prisma/client";
import { xtreamUnauthPayload } from "../../../src/lib/xtream-unauth";
import { lineIsPlayable, effectiveLineStatus } from "../../../src/lib/lines";
import { connectionCapacityAllows } from "../../../src/lib/connections";
import { exportPlaybackUrl } from "../../../src/lib/export-playback-url";
import {
  mapXtreamLiveItem,
  mapXtreamVodItem,
  mapXtreamSeriesItem,
} from "../../../src/lib/xtream-catalog-items";
import { emptyXtreamSeriesInfo } from "../../../src/lib/xtream-info";
import { cuidToNum } from "../../../src/lib/xtream-stream-id";
import type { CanonicalCategoryMaps } from "../../../src/lib/xtream-category-canonical";
import {
  authorizeGetPhp,
  authorizeLive,
  buildM3u,
  buildXmltv,
  handlePlayerApi,
  registerLine,
  seedDefaultCatalog,
  setNow,
  state,
  userInfoPayload,
} from "./harness";

const LIVE_KEYS = [
  "num",
  "name",
  "title",
  "stream_display_name",
  "stream_type",
  "stream_id",
  "stream_icon",
  "thumbnail",
  "epg_channel_id",
  "epg_id",
  "added",
  "category_id",
  "category_ids",
  "custom_sid",
  "is_adult",
  "tv_archive",
  "direct_source",
  "tv_archive_duration",
  "updated_at",
] as const;

const VOD_KEYS = [
  "num",
  "name",
  "stream_type",
  "stream_id",
  "stream_icon",
  "movie_image",
  "rating",
  "rating_5based",
  "added",
  "updated_at",
  "last_modified",
  "is_adult",
  "category_id",
  "category_ids",
  "container_extension",
  "custom_sid",
  "direct_source",
] as const;

const SERIES_LIST_KEYS = [
  "num",
  "name",
  "series_id",
  "cover",
  "plot",
  "cast",
  "director",
  "genre",
  "releaseDate",
  "last_modified",
  "rating",
  "rating_5based",
  "backdrop_path",
  "youtube_trailer",
  "episode_run_time",
  "category_id",
] as const;

const USER_INFO_KEYS = [
  "username",
  "password",
  "epg_url",
  "offline_image_url",
  "message",
  "auth",
  "status",
  "exp_date",
  "is_trial",
  "active_cons",
  "created_at",
  "max_connections",
  "allowed_output_formats",
  "allowed_outputs",
] as const;

const SERVER_INFO_KEYS = [
  "url",
  "port",
  "https_port",
  "server_protocol",
  "rtmp_port",
  "timezone",
  "timestamp_now",
] as const;

function q(pairs: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(pairs)) p.set(k, v);
  return p;
}

function emptyCanonical(): CanonicalCategoryMaps {
  return {
    numericByCategoryId: new Map([
      ["cat_live_1", "1"],
      ["cat_vod_1", "2"],
      ["cat_series_1", "3"],
    ]),
    byMergeKey: new Map([
      [
        "sports",
        { categoryId: "cat_live_1", name: "Sports", numericId: "1", mergeKey: "sports" },
      ],
      [
        "movies",
        { categoryId: "cat_vod_1", name: "Movies", numericId: "2", mergeKey: "movies" },
      ],
      [
        "series",
        { categoryId: "cat_series_1", name: "Series", numericId: "3", mergeKey: "series" },
      ],
    ]),
    cuidsByNumericId: new Map([
      ["1", ["cat_live_1"]],
      ["2", ["cat_vod_1"]],
      ["3", ["cat_series_1"]],
    ]),
  };
}

describe("Xtream player_api.php (integration)", () => {
  beforeEach(() => {
    seedDefaultCatalog();
  });

  it("bare auth returns user_info + server_info with Xtream key names/types", () => {
    const body = handlePlayerApi(
      q({ username: "xtream_user", password: "xtream_pass" })
    ) as {
      user_info: Record<string, unknown>;
      server_info: Record<string, unknown>;
    };
    for (const k of USER_INFO_KEYS) assert.ok(k in body.user_info, `user_info.${k}`);
    for (const k of SERVER_INFO_KEYS) assert.ok(k in body.server_info, `server_info.${k}`);
    assert.equal(body.user_info.auth, 1);
    assert.equal(typeof body.user_info.auth, "number");
    assert.equal(typeof body.user_info.username, "string");
    assert.equal(typeof body.user_info.exp_date, "string");
    assert.equal(typeof body.user_info.max_connections, "string");
    assert.equal(typeof body.user_info.active_cons, "string");
    assert.equal(typeof body.user_info.is_trial, "string");
    assert.ok(Array.isArray(body.user_info.allowed_output_formats));
  });

  it("wrong username/password returns standard auth:0 shape (production unauth helper)", () => {
    const prod = xtreamUnauthPayload("http://panel.test");
    assert.equal(prod.user_info.auth, 0);
    assert.equal(typeof prod.user_info.auth, "number");
    assert.ok(prod.server_info);
    assert.equal(typeof prod.server_info.url, "string");

    const viaApi = handlePlayerApi(q({ username: "nope", password: "wrong" })) as {
      user_info: { auth: number };
    };
    assert.equal(viaApi.user_info.auth, 0);
  });

  for (const [label, creds] of [
    ["missing both", {}],
    ["missing password", { username: "xtream_user" }],
    ["empty password", { username: "xtream_user", password: "" }],
  ] as const) {
    it(`unauth probe (${label}) returns auth:0`, () => {
      const body = handlePlayerApi(q(creds as Record<string, string>)) as {
        user_info: { auth: number };
      };
      assert.equal(body.user_info.auth, 0);
    });
  }

  it("table: line status rejects playable gate (production effectiveLineStatus)", () => {
    const cases: { status: LineStatus; expiresAt: Date; playable: boolean }[] = [
      { status: LineStatus.ACTIVE, expiresAt: new Date(Date.now() + 86_400_000), playable: true },
      { status: LineStatus.DISABLED, expiresAt: new Date(Date.now() + 86_400_000), playable: false },
      { status: LineStatus.BANNED, expiresAt: new Date(Date.now() + 86_400_000), playable: false },
      { status: LineStatus.EXPIRED, expiresAt: new Date(Date.now() + 86_400_000), playable: false },
      { status: LineStatus.ACTIVE, expiresAt: new Date(Date.now() - 1), playable: false },
    ];
    for (const c of cases) {
      assert.equal(
        lineIsPlayable({ status: c.status, expiresAt: c.expiresAt }),
        c.playable,
        `${c.status}`
      );
    }
  });

  it("expired / disabled / banned lines return auth:0 on bare login payload", () => {
    for (const status of [LineStatus.DISABLED, LineStatus.BANNED, LineStatus.EXPIRED] as const) {
      seedDefaultCatalog();
      registerLine({
        username: `u_${status}`,
        password: "p",
        status,
        expiresAt: new Date(state.nowMs + 86_400_000),
      });
      const body = userInfoPayload(state.linesByCred.get(`u_${status}\0p`)!);
      assert.equal(body.user_info.auth, 0, status);
      assert.equal(body.user_info.status, "Disabled");
    }
    seedDefaultCatalog();
    registerLine({
      username: "u_expired_time",
      password: "p",
      status: LineStatus.ACTIVE,
      expiresAt: new Date(state.nowMs - 1),
    });
    const expired = userInfoPayload(state.linesByCred.get(`u_expired_time\0p`)!);
    assert.equal(expired.user_info.auth, 0);
  });

  it("trial/expiry boundary: equal second still playable; one ms past rejects", () => {
    const boundary = 1_700_000_000_000;
    mock.timers.enable({ apis: ["Date"], now: boundary });
    try {
      const atExact = { status: LineStatus.ACTIVE, expiresAt: new Date(boundary) };
      // Production: expiresAt < now (not <=)
      assert.equal(effectiveLineStatus(atExact), LineStatus.ACTIVE);
      assert.equal(lineIsPlayable(atExact), true);

      mock.timers.setTime(boundary + 1);
      assert.equal(effectiveLineStatus(atExact), LineStatus.EXPIRED);
      assert.equal(lineIsPlayable(atExact), false);
    } finally {
      mock.timers.reset();
    }

    // Harness mirror for player_api bare-auth payload
    setNow(boundary);
    registerLine({
      username: "trial_boundary",
      password: "p",
      status: LineStatus.ACTIVE,
      expiresAt: new Date(boundary),
    });
    assert.equal(userInfoPayload(state.linesByCred.get("trial_boundary\0p")!).user_info.auth, 1);
    setNow(boundary + 1);
    assert.equal(userInfoPayload(state.linesByCred.get("trial_boundary\0p")!).user_info.auth, 0);
  });

  it("get_live_categories returns category_id / category_name keys only for assigned bouquet", () => {
    const rows = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_live_categories",
      })
    ) as { category_id: string; category_name: string; parent_id: number }[];
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.category_name, "Sports");
    assert.equal(typeof rows[0]!.category_id, "string");
    assert.equal(typeof rows[0]!.parent_id, "number");
  });

  it("get_live_streams returns Xtream live keys and excludes other-bouquet channels", () => {
    const rows = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_live_streams",
      })
    ) as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Sky Sports Main Event");
    for (const k of LIVE_KEYS) assert.ok(k in rows[0]!, k);
    assert.equal(rows[0]!.stream_type, "live");
    assert.equal(typeof rows[0]!.stream_id, "number");

    const canonical = emptyCanonical();
    const prodShape = mapXtreamLiveItem(
      {
        id: "stream_live_in",
        name: "Sky Sports Main Event",
        type: StreamType.LIVE,
        categoryId: "cat_live_1",
        categoryType: "LIVE",
        streamUrl: "http://127.0.0.1/x",
        streamIcon: "http://127.0.0.1/logo.png",
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        epgChannelId: "sky.sports.main",
        vodMode: null,
        isShifted: false,
        archiveDays: 0,
        timeshiftSeconds: null,
      } as never,
      0,
      canonical
    );
    for (const k of LIVE_KEYS) assert.ok(k in prodShape, `prod ${k}`);
  });

  it("get_vod_categories / get_vod_streams / get_vod_info key contracts", () => {
    const cats = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_vod_categories",
      })
    ) as { category_id: string; category_name: string }[];
    assert.equal(cats[0]!.category_name, "Movies");

    const streams = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_vod_streams",
      })
    ) as Record<string, unknown>[];
    assert.equal(streams.length, 1);
    for (const k of VOD_KEYS) assert.ok(k in streams[0]!, k);

    const info = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_vod_info",
        vod_id: "stream_movie_1",
      })
    ) as { info: Record<string, unknown>; movie_data: Record<string, unknown> };
    assert.ok(info.info);
    assert.ok(info.movie_data);
    assert.equal(typeof info.movie_data.stream_id, "number");
    assert.equal(typeof info.movie_data.container_extension, "string");
    assert.equal(typeof info.info.plot, "string");
  });

  it("get_series / get_series_info key contracts", () => {
    const list = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_series",
      })
    ) as Record<string, unknown>[];
    assert.equal(list.length, 1);
    for (const k of SERIES_LIST_KEYS) assert.ok(k in list[0]!, k);

    const empty = emptyXtreamSeriesInfo();
    assert.ok(Array.isArray(empty.seasons));
    assert.equal(typeof empty.info.name, "string");
    assert.ok(empty.episodes);

    const info = handlePlayerApi(
      q({
        username: "xtream_user",
        password: "xtream_pass",
        action: "get_series_info",
        series_id: "stream_ep_1",
      })
    ) as {
      seasons: unknown[];
      info: Record<string, unknown>;
      episodes: Record<string, unknown[]>;
    };
    assert.ok(Array.isArray(info.seasons));
    assert.equal(info.info.name, "Test Series");
    assert.ok(info.episodes["1"]);
    assert.equal(typeof info.episodes["1"]![0]!.stream_id, "number");
  });

  it("get_short_epg and get_simple_data_table return epg_listings array", () => {
    for (const action of ["get_short_epg", "get_simple_data_table"] as const) {
      const body = handlePlayerApi(
        q({
          username: "xtream_user",
          password: "xtream_pass",
          action,
          stream_id: "stream_live_in",
        })
      ) as { epg_listings: Record<string, unknown>[] };
      assert.ok(Array.isArray(body.epg_listings));
      assert.ok(body.epg_listings.length >= 1);
      const row = body.epg_listings[0]!;
      for (const k of [
        "id",
        "epg_id",
        "title",
        "lang",
        "start",
        "end",
        "description",
        "channel_id",
        "start_timestamp",
        "stop_timestamp",
      ]) {
        assert.ok(k in row, `${action}.${k}`);
      }
    }
  });
});

describe("Xtream get.php M3U (integration)", () => {
  beforeEach(() => seedDefaultCatalog());

  it("rejects wrong credentials with 401", () => {
    const auth = authorizeGetPhp("xtream_user", "bad");
    assert.ok(auth.error);
    assert.equal(auth.error!.status, 401);
  });

  it("rejects disabled / banned / expired lines", () => {
    for (const status of [LineStatus.DISABLED, LineStatus.BANNED] as const) {
      seedDefaultCatalog();
      registerLine({ username: "badline", password: "p", status });
      assert.equal(authorizeGetPhp("badline", "p").error?.status, 401);
    }
  });

  it("emits #EXTM3U, #EXTINF with tvg-id / tvg-logo / group-title for assigned bouquet only", () => {
    const line = state.linesByCred.get("xtream_user\0xtream_pass")!;
    const body = buildM3u(line, "http://panel.test", "ts");
    assert.match(body, /^#EXTM3U/m);
    assert.match(body, /#EXTINF:-1/);
    assert.match(body, /tvg-id="sky\.sports\.main"/);
    assert.match(body, /tvg-logo="http:\/\/127\.0\.0\.1\/mock\/logo\.png"/);
    assert.match(body, /group-title="Sports"/);
    assert.match(body, /\/live\/xtream_user\/xtream_pass\/stream_live_in\.ts/);
    assert.doesNotMatch(body, /Other Bouquet Channel/);
    assert.doesNotMatch(body, /stream_live_out/);
  });

  it("hls output uses .m3u8 live paths", () => {
    const line = state.linesByCred.get("xtream_user\0xtream_pass")!;
    const body = buildM3u(line, "http://panel.test", "hls");
    assert.match(body, /\/live\/xtream_user\/xtream_pass\/stream_live_in\.m3u8/);
  });
});

describe("Xtream xmltv.php (integration)", () => {
  beforeEach(() => seedDefaultCatalog());

  it("emits XML declaration, xmltv.dtd DOCTYPE, channel + programme elements", () => {
    const line = state.linesByCred.get("xtream_user\0xtream_pass")!;
    const xml = buildXmltv(line);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<!DOCTYPE tv SYSTEM "xmltv\.dtd">/);
    assert.match(xml, /<tv generator-info-name="Xtream Codes"/);
    assert.match(xml, /<channel id="sky\.sports\.main">/);
    assert.match(xml, /<display-name>Sky Sports Main Event<\/display-name>/);
    assert.match(xml, /<programme start="\d{14} \+0000" stop="\d{14} \+0000" channel="sky\.sports\.main">/);
    assert.match(xml, /<title>Live Match<\/title>/);
    assert.doesNotMatch(xml, /other\.ch/);
  });

  it("unauthorized credentials rejected", () => {
    assert.equal(authorizeGetPhp("x", "y").error?.status, 401);
  });
});

describe("Xtream stream URLs /live/{user}/{pass}/{id}.ts|.m3u8", () => {
  beforeEach(() => seedDefaultCatalog());

  it("production exportPlaybackUrl builds /live/{user}/{pass}/{id}.ts and .m3u8", () => {
    const prev = process.env.NEXLIFY_MEDIA_ORIGIN;
    delete process.env.NEXLIFY_MEDIA_ORIGIN;
    try {
      const line = { username: "xtream_user", password: "xtream_pass" };
      const mpegts = {
        id: "stream_live_in",
        type: StreamType.LIVE,
        streamUrl: "http://127.0.0.1/mock/live.ts",
        containerExtension: null,
      };
      const ts = exportPlaybackUrl("http://panel.test", line, mpegts);
      assert.equal(ts, "http://panel.test/live/xtream_user/xtream_pass/stream_live_in.ts");

      // .m3u8 export requires an HLS upstream (production gate in exportPlaybackUrl)
      const hlsStream = {
        id: "stream_live_hls",
        type: StreamType.LIVE,
        streamUrl: "http://127.0.0.1/mock/index.m3u8",
        containerExtension: "m3u8",
      };
      const hls = exportPlaybackUrl(
        "http://panel.test",
        line,
        hlsStream,
        hlsStream as never,
        undefined,
        "hls"
      );
      assert.equal(hls, "http://panel.test/live/xtream_user/xtream_pass/stream_live_hls.m3u8");
    } finally {
      if (prev === undefined) delete process.env.NEXLIFY_MEDIA_ORIGIN;
      else process.env.NEXLIFY_MEDIA_ORIGIN = prev;
    }
  });

  it("max_connections: N sessions ok, N+1 refused (production connectionCapacityAllows + live auth)", () => {
    const line = state.linesByCred.get("xtream_user\0xtream_pass")!;
    assert.equal(line.maxConnections, 1);

    // Pure production helper
    assert.equal(connectionCapacityAllows(0, 1, 0, "10.0.0.1"), true);
    assert.equal(connectionCapacityAllows(1, 1, 0, "10.0.0.2"), false);
    assert.equal(connectionCapacityAllows(1, 1, 1, "10.0.0.1", false), true);

    state.liveConnections.push({
      lineId: line.id,
      ip: "10.0.0.1",
      streamId: "stream_live_in",
      lastSeenAt: state.nowMs,
    });

    const okSame = authorizeLive("xtream_user", "xtream_pass", "stream_live_in", "10.0.0.1");
    assert.equal(okSame.status, 200);

    const refused = authorizeLive("xtream_user", "xtream_pass", "stream_live_in", "10.0.0.2");
    assert.equal(refused.status, 403);
    assert.match(String(refused.body), /Max connections reached/i);
  });

  it("live URL rejects wrong password / expired line / other-bouquet stream", () => {
    assert.equal(
      authorizeLive("xtream_user", "bad", "stream_live_in", "10.0.0.9").status,
      401
    );
    registerLine({
      username: "expired_live",
      password: "p",
      status: LineStatus.ACTIVE,
      expiresAt: new Date(state.nowMs - 1000),
    });
    assert.equal(
      authorizeLive("expired_live", "p", "stream_live_in", "10.0.0.9").status,
      403
    );
    assert.equal(
      authorizeLive("xtream_user", "xtream_pass", "stream_live_out", "10.0.0.9").status,
      404
    );
  });
});

describe("Xtream production catalog item key parity", () => {
  it("mapXtreamVodItem / mapXtreamSeriesItem expose client keys", () => {
    const canonical = emptyCanonical();
    const vod = mapXtreamVodItem(
      {
        id: "m1",
        name: "Film",
        type: StreamType.MOVIE,
        categoryId: "cat_vod_1",
        categoryType: "MOVIE",
        streamUrl: "http://127.0.0.1/a.mp4",
        streamIcon: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isAdult: false,
        containerExtension: "mp4",
        urlExt: "mp4",
        vodRating: "8",
      } as never,
      0,
      canonical
    );
    for (const k of VOD_KEYS) assert.ok(k in vod, k);

    const series = mapXtreamSeriesItem(
      {
        id: "s1",
        name: "Ep",
        seriesName: "Show",
        categoryId: "cat_series_1",
        streamIcon: "",
        updatedAt: new Date(),
        vodRating: null,
        vodPlot: null,
      } as never,
      0,
      canonical
    );
    assert.equal(typeof series.series_id, "number");
    assert.equal(cuidToNum("s1"), series.series_id);
  });
});
