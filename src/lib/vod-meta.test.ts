import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeVodAgentCmd,
  encodeVodMetaFromXuiProperties,
  mergeVodTmdbFields,
  parseVodAgentCmd,
  parseXtreamVodMeta,
  readVodTmdbFields,
  rewriteVodAgentCmdForXtream,
  vodAgentCmdNeedsXtreamRewrite,
  VOD_META_PREFIX,
} from "./vod-meta";

test("legacy NEXLIFY_VOD prefix is invisible to raw JSON.parse", () => {
  const legacy = `${VOD_META_PREFIX}${JSON.stringify({
    tmdbOverview: "A thief who steals dreams",
    tmdbCast: "Leonardo DiCaprio",
    tmdbDirector: "Christopher Nolan",
    tmdbGenres: "Action, Sci-Fi",
    tmdbRating: "8.4",
    tmdbRelease: "2010-07-16",
    tmdbRuntime: "148",
  })}`;
  assert.deepEqual(JSON.parse(JSON.stringify({})), {});
  try {
    JSON.parse(legacy);
    assert.fail("expected raw JSON.parse to fail on NEXLIFY_VOD prefix");
  } catch {
    /* expected */
  }
  assert.equal(vodAgentCmdNeedsXtreamRewrite(legacy), true);
  const meta = parseXtreamVodMeta(legacy);
  assert.equal(meta.plot, "A thief who steals dreams");
  assert.equal(meta.cast, "Leonardo DiCaprio");
});

test("encodeVodAgentCmd writes plot/cast that Xtream parseMetaJson can read", () => {
  const encoded = encodeVodAgentCmd({
    tmdbOverview: "A thief who steals dreams",
    tmdbCast: "Leonardo DiCaprio",
    tmdbDirector: "Christopher Nolan",
    tmdbGenres: "Action, Sci-Fi",
    tmdbRating: "8.4",
    tmdbRelease: "2010-07-16",
    tmdbRuntime: "148",
    tmdbTrailer: "https://youtu.be/inception",
  });
  assert.equal(encoded.startsWith(VOD_META_PREFIX), false);
  const meta = parseXtreamVodMeta(encoded);
  assert.equal(meta.plot, "A thief who steals dreams");
  assert.equal(meta.cast, "Leonardo DiCaprio");
  assert.equal(meta.director, "Christopher Nolan");
  assert.equal(meta.genre, "Action, Sci-Fi");
  assert.equal(meta.rating, "8.4");
  assert.equal(meta.releaseDate, "2010-07-16");
  assert.equal(meta.trailer, "https://youtu.be/inception");
  assert.equal(meta.duration, "02:28:00");
  assert.equal(meta.durationSecs, 8880);
  assert.equal(meta.rating_5based, 4.2);
});

test("rewriteVodAgentCmdForXtream converts the prefix blob", () => {
  const legacy = `${VOD_META_PREFIX}${JSON.stringify({ tmdbOverview: "Hello", tmdbCast: "Bob" })}`;
  const next = rewriteVodAgentCmdForXtream(legacy);
  assert.ok(next);
  const meta = parseXtreamVodMeta(next!);
  assert.equal(meta.plot, "Hello");
  assert.equal(meta.cast, "Bob");
});

test("parseVodAgentCmd reads both prefix and plain JSON", () => {
  assert.equal(parseVodAgentCmd(`${VOD_META_PREFIX}{"plot":"A"}`).plot, "A");
  assert.equal(parseVodAgentCmd('{"plot":"B"}').plot, "B");
  assert.deepEqual(parseVodAgentCmd("ffmpeg -i x"), {});
});

test("readVodTmdbFields maps legacy prefix and Xtream plot aliases", () => {
  const legacy = `${VOD_META_PREFIX}${JSON.stringify({
    tmdbOverview: "Dream within a dream",
    tmdbCast: "Leo",
    tmdbGenres: "Sci-Fi",
    tmdbId: "27205",
  })}`;
  const fields = readVodTmdbFields(legacy);
  assert.equal(fields.tmdbOverview, "Dream within a dream");
  assert.equal(fields.tmdbCast, "Leo");
  assert.equal(fields.tmdbId, "27205");
  const merged = mergeVodTmdbFields(legacy, { tmdbRating: "8.8" });
  assert.equal(parseXtreamVodMeta(merged).rating, "8.8");
});

test("encodeVodMetaFromXuiProperties maps movie_properties", () => {
  const cmd = encodeVodMetaFromXuiProperties({
    plot: "Saved from XUI",
    actors: "A, B",
    director: "C",
    genre: "Drama",
    releasedate: "1999-01-01",
    tmdb_id: "603",
    duration_secs: 136,
    youtube_trailer: "https://youtu.be/m",
  });
  assert.ok(cmd);
  const meta = parseXtreamVodMeta(cmd!);
  assert.equal(meta.plot, "Saved from XUI");
  assert.equal(meta.cast, "A, B");
  assert.equal(meta.tmdbId, "603");
  assert.equal(meta.durationSecs, 136);
});
