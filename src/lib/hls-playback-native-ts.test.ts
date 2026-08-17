import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHlsRelayUrl,
  buildNativeTsHlsManifest,
  rewritePackagerPlaylist,
} from "./hls-playback";
import { alignPackagerMediaSequence, isPackagerSegmentName } from "./ts-hls-packager";

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
  assert.match(body, /^\/live\/user1\/pass1\/stream123\.ts$/m);
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

test("sanitizeHlsPlaylist drops DISCONTINUITY tags that freeze Smarters", async () => {
  const { sanitizeHlsPlaylist, buildClientDirectHlsMaster, shouldOfferClientDirectHls } =
    await import("./hls-playback");
  const src = [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:4",
    "#EXT-X-DISCONTINUITY",
    "#EXTINF:2.0,",
    "seg0.ts",
    "#EXT-X-DISCONTINUITY-SEQUENCE:1",
    "#EXTINF:2.0,",
    "seg1.ts",
    "",
  ].join("\n");
  const out = sanitizeHlsPlaylist(src);
  assert.equal(out.includes("DISCONTINUITY"), false);
  assert.match(out, /#EXT-X-VERSION:3/);
  assert.match(out, /#EXT-X-TARGETDURATION:2/);
  assert.match(out, /seg0\.ts/);
  assert.match(out, /seg1\.ts/);

  const overTd = sanitizeHlsPlaylist(
    ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-INDEPENDENT-SEGMENTS", "#EXT-X-TARGETDURATION:2", "#EXTINF:2.04,", "seg0.ts", ""].join("\n")
  );
  assert.match(overTd, /#EXT-X-VERSION:3/);
  assert.equal(overTd.includes("INDEPENDENT-SEGMENTS"), false);
  assert.match(overTd, /#EXT-X-TARGETDURATION:3/);

  const master = buildClientDirectHlsMaster("https://cdn.example/live/12.m3u8");
  assert.match(master, /#EXT-X-STREAM-INF:/);
  assert.match(master, /https:\/\/cdn\.example\/live\/12\.m3u8/);

  assert.equal(shouldOfferClientDirectHls(404), false);
  assert.equal(shouldOfferClientDirectHls(502, "Non-playable content-type: text/html"), true);
  assert.equal(shouldOfferClientDirectHls(504, "Upstream timeout"), true);
  assert.equal(shouldOfferClientDirectHls(502, "Upstream HTTP 404"), false);
  assert.equal(shouldOfferClientDirectHls(502, "html error page"), true);

  const inflatedTd = sanitizeHlsPlaylist(
    ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:4", "#EXTINF:1.8,", "seg156.ts", ""].join("\n")
  );
  assert.match(inflatedTd, /#EXT-X-TARGETDURATION:2/);
  assert.equal(inflatedTd.includes("TARGETDURATION:4"), false);
});

test("rewritePackagerPlaylist exposes finite HLS segments Smarters can fetch", () => {
  const src = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-MEDIA-SEQUENCE:3",
    "#EXTINF:2.0,",
    "seg3.ts",
    "#EXTINF:2.0,",
    "seg4.ts",
    "",
  ].join("\n");
  const body = rewritePackagerPlaylist(src, "http://45.88.138.18", "user1", "pass1", "1862838169");
  assert.match(body, /#EXT-X-TARGETDURATION:2/);
  assert.match(body, /\/live\/user1\/pass1\/1862838169\/hls\/seg3\.ts/);
  assert.match(body, /\/live\/user1\/pass1\/1862838169\/hls\/seg4\.ts/);
  assert.equal(body.includes("1862838169.ts"), false);
  assert.equal(body.includes("#EXTINF:-1"), false);
});

test("rewritePackagerPlaylist strips DISCONTINUITY before rewriting segments", () => {
  const src = ["#EXTM3U", "#EXT-X-DISCONTINUITY", "#EXTINF:2.0,", "seg3.ts", ""].join("\n");
  const body = rewritePackagerPlaylist(
    src,
    "http://45.88.138.18",
    "user1",
    "pass1",
    "1862838169"
  );
  assert.equal(body.includes("DISCONTINUITY"), false);
  assert.match(body, /^\/live\/user1\/pass1\/1862838169\/hls\/seg3\.ts$/m);
  assert.equal(body.includes("http://"), false);
});

test("markHlsPlaylistAsVod tags movies/series playlists for ExoPlayer", async () => {
  const { markHlsPlaylistAsVod } = await import("./hls-playback");
  const src = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:4", "#EXTINF:4.0,", "seg0.ts", ""].join("\n");
  const out = markHlsPlaylistAsVod(src);
  assert.match(out, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(out, /#EXT-X-VERSION:3/);
});

test("buildVodProgressiveHlsManifest never returns raw video on a .m3u8 URL", async () => {
  const { buildVodProgressiveHlsManifest } = await import("./hls-playback");
  const body = buildVodProgressiveHlsManifest("movie", "user1", "pass1", "123");
  assert.match(body, /#EXTM3U/);
  assert.match(body, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(body, /^\/movie\/user1\/pass1\/123\.mp4$/m);
  assert.match(body, /#EXT-X-ENDLIST/);
});

test("isPackagerSegmentName accepts ffmpeg segment files only", () => {
  assert.equal(isPackagerSegmentName("seg3.ts"), true);
  assert.equal(isPackagerSegmentName("../etc/passwd"), false);
});

test("alignPackagerMediaSequence matches the first remaining segment", () => {
  const src = [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:4",
    "#EXT-X-MEDIA-SEQUENCE:151",
    "#EXTINF:1.8,",
    "seg156.ts",
    "#EXTINF:1.8,",
    "seg157.ts",
    "",
  ].join("\n");
  const out = alignPackagerMediaSequence(src);
  assert.match(out, /#EXT-X-MEDIA-SEQUENCE:156/);
  assert.equal(out.includes("MEDIA-SEQUENCE:151"), false);
});

test("xtreamHlsSourceUrl matches XUI stream_source container swap", async () => {
  const { xtreamHlsSourceUrl, expandHlsPlaybackCandidates } = await import("./hls-playback");
  assert.equal(
    xtreamHlsSourceUrl("http://x96.pro:8880/live/Ghostfacee/Ghostfac12/136058.ts"),
    "http://x96.pro:8880/live/Ghostfacee/Ghostfac12/136058.m3u8"
  );
  assert.equal(
    xtreamHlsSourceUrl("https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/51498"),
    "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/51498.m3u8"
  );
  assert.equal(xtreamHlsSourceUrl("http://cdn.example/live/index.m3u8"), null);
  const expanded = expandHlsPlaybackCandidates([
    "https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/51498",
  ]);
  assert.equal(expanded[0], "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/51498.m3u8");
  assert.equal(expanded[1], "https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/51498");
});
