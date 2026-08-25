import assert from "node:assert/strict";
import test from "node:test";
import {
  pickPlaylistOrigin,
  playlistFetchPath,
  playlistHostnameFromDomain,
  playlistOriginFromPreferredHost,
  rewritePlaylistTextOrigins,
} from "./line-playlist-urls";

test("playlistHostnameFromDomain strips scheme and port", () => {
  assert.equal(playlistHostnameFromDomain("https://tv.example.com:443/path"), "tv.example.com");
  assert.equal(playlistHostnameFromDomain("tv.example.com"), "tv.example.com");
});

test("playlistOriginFromPreferredHost swaps IP for domain and keeps extra IPTV ports", () => {
  assert.equal(
    playlistOriginFromPreferredHost("tv.example.com", "http://45.88.138.18"),
    "http://tv.example.com"
  );
  assert.equal(
    playlistOriginFromPreferredHost("tv.example.com", "http://45.88.138.18:8080"),
    "http://tv.example.com:8080"
  );
  assert.equal(
    playlistOriginFromPreferredHost("tv.example.com", "http://45.88.138.18:13000"),
    "http://tv.example.com"
  );
});

test("rewritePlaylistTextOrigins rewrites get.php stream hosts", () => {
  const m3u = "#EXTM3U\nhttp://45.88.138.18/live/u/p/1.ts\n";
  assert.equal(
    rewritePlaylistTextOrigins(m3u, "http://45.88.138.18", "http://tv.example.com"),
    "#EXTM3U\nhttp://tv.example.com/live/u/p/1.ts\n"
  );
});

test("playlistFetchPath keeps get.php on the admin session origin", () => {
  assert.equal(
    playlistFetchPath("http://tv.example.com/get.php?username=a&password=b&type=m3u"),
    "/get.php?username=a&password=b&type=m3u"
  );
});

test("pickPlaylistOrigin keeps the domain the client used when several are configured", () => {
  assert.equal(
    pickPlaylistOrigin("http://b.example.com", ["a.example.com", "b.example.com", "c.example.com"]),
    "http://b.example.com"
  );
});

test("pickPlaylistOrigin swaps an IP admin session to the first configured domain", () => {
  assert.equal(
    pickPlaylistOrigin("http://45.88.138.18", ["tv.example.com", "cdn.example.com"]),
    "http://tv.example.com"
  );
});
