import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportPlaybackUrl } from "./export-playback-url";

describe("exportPlaybackUrl", () => {
  const baseUrl = "http://45.88.138.18";
  const line = { username: "demo", password: "pass" };

  it("keeps live playback on panel ts path", () => {
    const url = exportPlaybackUrl(baseUrl, line, {
      id: "live123",
      type: "LIVE",
      streamUrl: "http://upstream/live.ts",
      containerExtension: null,
    });
    assert.equal(url, "http://45.88.138.18/live/demo/pass/live123.ts");
  });

  it("routes movies through the panel movie path", () => {
    const url = exportPlaybackUrl(baseUrl, line, {
      id: "movie123",
      type: "MOVIE",
      streamUrl: "http://upstream/movie.mkv",
      containerExtension: "mkv",
    });
    assert.equal(url, "http://45.88.138.18/movie/demo/pass/movie123.mkv");
  });

  it("routes series through the panel series path", () => {
    const url = exportPlaybackUrl(baseUrl, line, {
      id: "series123",
      type: "SERIES",
      streamUrl: "http://upstream/series.mkv",
      containerExtension: null,
    });
    assert.equal(url, "http://45.88.138.18/series/demo/pass/series123.mkv");
  });
});
