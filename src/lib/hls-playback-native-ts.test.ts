import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHlsRelayUrl,
  buildNativeTsHlsManifest,
  rewritePackagerPlaylist,
} from "./hls-playback";
import { isPackagerSegmentName } from "./ts-hls-packager";

test("buildNativeTsHlsManifest points .m3u8 clients at panel .ts URL", () => {
  const body = buildNativeTsHlsManifest(
    "http://45.88.138.18",
    "user1",
    "pass1",
    "stream123"
  );
  assert.ok(body.startsWith("#EXTM3U"));
  assert.match(body, /#EXT-X-VERSION:3/);
  assert.match(body, /#EXT-X-PLAYLIST-TYPE:EVENT/);
  assert.match(body, /#EXTINF:-1,/);
  assert.match(body, /http:\/\/45\.88\.138\.18\/live\/user1\/pass1\/stream123\.ts$/m);
});

test("buildHlsRelayUrl uses path token without query string", () => {
  const url = buildHlsRelayUrl(
    "http://45.88.138.18",
    "user1",
    "pass1",
    "1862838169",
    "https://cdn.example/live/index.m3u8"
  );
  assert.match(url, /\/live\/user1\/pass1\/1862838169\/hls\/[A-Za-z0-9_-]+$/);
  assert.equal(url.includes("?u="), false);
});

test("rewritePackagerPlaylist rewrites segN.ts to panel HLS paths", () => {
  const src = ["#EXTM3U", "#EXTINF:2.0,", "seg3.ts", ""].join("\n");
  const body = rewritePackagerPlaylist(
    src,
    "http://45.88.138.18",
    "user1",
    "pass1",
    "1862838169"
  );
  assert.match(
    body,
    /http:\/\/45\.88\.138\.18\/live\/user1\/pass1\/1862838169\/hls\/seg3\.ts/
  );
});

test("isPackagerSegmentName accepts ffmpeg segment files only", () => {
  assert.equal(isPackagerSegmentName("seg3.ts"), true);
  assert.equal(isPackagerSegmentName("../etc/passwd"), false);
});
