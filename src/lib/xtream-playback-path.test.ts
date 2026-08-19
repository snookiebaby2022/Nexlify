import assert from "node:assert/strict";
import test from "node:test";
import { parseXtreamPlaybackPath } from "./xtream-playback-path";

test("parseXtreamPlaybackPath matches XUI /live/user/pass/id.ts", () => {
  const p = parseXtreamPlaybackPath("/live/user1/pass1/123.ts");
  assert.equal(p?.kind, "live");
  assert.equal(p?.username, "user1");
  assert.equal(p?.password, "pass1");
  assert.equal(p?.spliceLiveTs, true);
  assert.equal(p?.wantsHls, false);
  assert.equal(p?.spliceVod, false);
});

test("parseXtreamPlaybackPath marks HLS playlist and packager segments", () => {
  const playlist = parseXtreamPlaybackPath("/live/u/p/123.m3u8");
  assert.equal(playlist?.spliceLiveTs, false);
  assert.equal(playlist?.wantsHls, true);
  const relay = parseXtreamPlaybackPath("/live/u/p/123/hls/token");
  assert.equal(relay?.spliceLiveTs, false);
  assert.equal(relay?.wantsHls, true);
  const seg = parseXtreamPlaybackPath("/live/u/p/123/hls/seg0.ts");
  assert.equal(seg?.spliceLiveTs, false);
  assert.equal(seg?.wantsHls, true);
  assert.equal(seg?.streamKey, "123/hls/seg0.ts");
});

test("parseXtreamPlaybackPath splices movie/series but not timeshift", () => {
  assert.equal(parseXtreamPlaybackPath("/movie/u/p/9.mp4")?.spliceVod, true);
  assert.equal(parseXtreamPlaybackPath("/series/u/p/9.mkv")?.spliceVod, true);
  assert.equal(parseXtreamPlaybackPath("/timeshift/u/p/9")?.spliceLiveTs, false);
  assert.equal(parseXtreamPlaybackPath("/timeshift/u/p/9")?.spliceVod, false);
});
