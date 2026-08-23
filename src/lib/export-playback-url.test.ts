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

  it("uses the provider URL for movies when direct play is on", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "movie123",
        type: "MOVIE",
        streamUrl: "http://upstream/movie.mkv",
        containerExtension: "mkv",
      },
      undefined,
      undefined,
      "auto",
      true
    );
    assert.equal(url, "http://upstream/movie.mkv");
  });

  it("routes movies through the panel movie path when direct play is off", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "movie123",
        type: "MOVIE",
        streamUrl: "http://upstream/movie.mkv",
        containerExtension: "mkv",
      },
      undefined,
      undefined,
      "auto",
      false
    );
    assert.equal(url, "http://45.88.138.18/movie/demo/pass/movie123.mkv");
  });

  it("uses the panel movie path for lean rows with no source URL", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "movie123",
        type: "MOVIE",
        streamUrl: "",
        containerExtension: "mkv",
      },
      undefined,
      undefined,
      "auto",
      true
    );
    assert.equal(url, "http://45.88.138.18/movie/demo/pass/movie123.mkv");
  });

  it("forces live panel .ts when output is ts", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "live123",
        type: "LIVE",
        streamUrl: "http://upstream/live.m3u8",
        containerExtension: null,
      },
      undefined,
      undefined,
      "ts"
    );
    assert.equal(url, "http://45.88.138.18/live/demo/pass/live123.ts");
  });

  it("routes series through the panel series path when direct play is off", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "series123",
        type: "SERIES",
        streamUrl: "http://upstream/series.mkv",
        containerExtension: null,
      },
      undefined,
      undefined,
      "auto",
      false
    );
    assert.equal(url, "http://45.88.138.18/series/demo/pass/series123.mkv");
  });
});
