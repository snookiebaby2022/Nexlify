import assert from "node:assert/strict";
import test from "node:test";
import { buildNativeTsHlsManifest } from "./hls-playback";

test("buildNativeTsHlsManifest points .m3u8 clients at panel .ts URL", () => {
  const body = buildNativeTsHlsManifest(
    "http://45.88.138.18",
    "user1",
    "pass1",
    "stream123"
  );
  assert.ok(body.startsWith("#EXTM3U"));
  assert.match(body, /#EXT-X-VERSION:3/);
  assert.match(body, /#EXTINF:10\.0,/);
  assert.match(body, /http:\/\/45\.88\.138\.18\/live\/user1\/pass1\/stream123\.ts$/m);
});
