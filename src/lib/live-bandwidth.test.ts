import assert from "node:assert/strict";
import test from "node:test";
import {
  isEcoProfileHint,
  pickLowestBandwidthHlsVariant,
} from "./live-bandwidth";
import { parseLivePlaybackStreamKey } from "./transcode-live-urls";

test("isEcoProfileHint accepts eco/low aliases", () => {
  assert.equal(isEcoProfileHint("eco"), true);
  assert.equal(isEcoProfileHint("LOW"), true);
  assert.equal(isEcoProfileHint("720p"), false);
});

test("parseLivePlaybackStreamKey keeps _eco suffix as hint", () => {
  assert.deepEqual(parseLivePlaybackStreamKey("1862838169_eco.ts"), {
    token: "1862838169",
    profileHint: "eco",
  });
});

test("pickLowestBandwidthHlsVariant keeps the cheapest STREAM-INF rung", () => {
  const src = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
    "high.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360",
    "low.m3u8",
    "",
  ].join("\n");
  const out = pickLowestBandwidthHlsVariant(src);
  assert.match(out, /BANDWIDTH=800000/);
  assert.match(out, /low\.m3u8/);
  assert.equal(out.includes("high.m3u8"), false);
  assert.equal(out.includes("5000000"), false);
});

test("pickLowestBandwidthHlsVariant leaves media playlists alone", () => {
  const src = ["#EXTM3U", "#EXT-X-TARGETDURATION:4", "#EXTINF:4.0,", "seg0.ts", ""].join("\n");
  assert.equal(pickLowestBandwidthHlsVariant(src), src);
});
