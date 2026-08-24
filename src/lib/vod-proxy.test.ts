import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickVodExtension, vodHlsFileRedirectLocation } from "./vod-proxy";

describe("vod HLS file redirect", () => {
  it("redirects a playlist request to the progressive file next to it", () => {
    const loc = vodHlsFileRedirectLocation("99.m3u8", "https://cdn.example/film.mkv");
    assert.equal(loc, "99.mkv");
  });

  it("does not wrap native origin HLS", () => {
    assert.equal(vodHlsFileRedirectLocation("99.m3u8", "https://cdn.example/film.m3u8"), null);
  });

  it("picks mkv from the origin URL", () => {
    assert.equal(pickVodExtension("https://cdn.example/a/b/c.mkv?token=1"), "mkv");
  });
});
