import assert from "node:assert/strict";
import test from "node:test";
import { parseM3u, guessStreamType, validateM3uPlaylist } from "./m3u-parser";
import { liveStreamDisplayName } from "./import-live-m3u";

test("guessStreamType treats Xtream short mpegts paths as LIVE", () => {
  assert.equal(
    guessStreamType({
      name: "BBC One",
      url: "https://junki3monk3y.com:443/Blade2nd/pass/1",
      group: "UK | Entertainment",
    }),
    "LIVE"
  );
});

test("guessStreamType prefers /movie/ and /series/ path over group", () => {
  assert.equal(
    guessStreamType({
      name: "Film",
      url: "https://prov.example/movie/u/p/99.mp4",
      group: "UK Live",
    }),
    "MOVIE"
  );
  assert.equal(
    guessStreamType({
      name: "Show S01E01",
      url: "https://prov.example/series/u/p/1.mkv",
      group: "Entertainment",
    }),
    "SERIES"
  );
});

test("guessStreamType does not treat live groups containing vod word as MOVIE", () => {
  assert.equal(
    guessStreamType({
      name: "Sky Sports",
      url: "https://prov.example:443/u/p/12",
      group: "Live | Sports",
    }),
    "LIVE"
  );
});

test("guessStreamType defaults ambiguous IPTV entries to LIVE", () => {
  assert.equal(
    guessStreamType({
      name: "Channel X",
      url: "https://cdn.example/stream/abc",
      group: "General",
    }),
    "LIVE"
  );
});

test("parseM3u prefers tvg-name over comma title", () => {
  const entries = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One HD" tvg-logo="https://cdn.example/bbc.png" group-title="UK",BBC 1
http://provider.example/live/1.ts
`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "BBC One HD");
  assert.equal(entries[0].tvgName, "BBC One HD");
  assert.equal(entries[0].logo, "https://cdn.example/bbc.png");
  assert.equal(entries[0].group, "UK");
  assert.equal(entries[0].tvgId, "bbc1.uk");
});

test("parseM3u falls back to comma title when tvg-name missing", () => {
  const entries = parseM3u(`#EXTM3U
#EXTINF:-1 group-title="Sports",Sky Sports Main Event
http://provider.example/live/2.ts
`);
  assert.equal(entries[0].name, "Sky Sports Main Event");
  assert.equal(entries[0].group, "Sports");
});

test("liveStreamDisplayName prefers tvgName", () => {
  assert.equal(
    liveStreamDisplayName({
      name: "Raw Title",
      url: "http://x",
      tvgName: "Clean Name",
    }),
    "Clean Name"
  );
});

test("validateM3uPlaylist rejects empty playlists", () => {
  for (const content of ["", "   ", "\n\n", "\uFEFF"]) {
    const result = validateM3uPlaylist(content);
    assert.equal(result.valid, false);
    assert.equal(result.entries.length, 0);
    assert.ok(result.issues.some((i) => i.code === "empty"));
  }
});

test("validateM3uPlaylist flags missing #EXTINF tags", () => {
  const result = validateM3uPlaylist(`#EXTM3U
http://provider.example/live/1.ts
`);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "missing_extinf"));
  assert.ok(result.issues.some((i) => i.code === "no_entries"));
  assert.equal(result.entries.length, 0);
});

test("validateM3uPlaylist flags malformed URLs", () => {
  const result = validateM3uPlaylist(`#EXTM3U
#EXTINF:-1,Broken
http://exa mple.com/bad space
#EXTINF:-1,Also broken
http://[not-a-valid-host
`);
  assert.equal(result.valid, false);
  const malformed = result.issues.filter((i) => i.code === "malformed_url");
  assert.ok(malformed.length >= 1, "expected at least one malformed_url issue");
  assert.ok(malformed.every((i) => typeof i.url === "string"));
});

test("validateM3uPlaylist accepts a well-formed playlist", () => {
  const result = validateM3uPlaylist(`#EXTM3U
#EXTINF:-1 tvg-name="BBC One",BBC
http://provider.example/live/1.ts
#EXTINF:-1,Sky
https://cdn.example/stream/2.m3u8
`);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.entries.length, 2);
});

test("validateM3uPlaylist flags missing #EXTM3U header", () => {
  const result = validateM3uPlaylist(`#EXTINF:-1,Only entry
http://provider.example/live/1.ts
`);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "missing_extm3u"));
  assert.equal(result.entries.length, 1);
});
