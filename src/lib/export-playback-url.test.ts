import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportPlaybackUrl, magHttpPlaybackOrigin } from "./export-playback-url";

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

  it("uses the dedicated media origin only for live playback", () => {
    const previous = process.env.NEXLIFY_MEDIA_ORIGIN;
    process.env.NEXLIFY_MEDIA_ORIGIN = "http://209.237.141.15:8080";
    try {
      const live = exportPlaybackUrl(baseUrl, line, {
        id: "live123",
        type: "LIVE",
        streamUrl: "http://upstream/live.ts",
        containerExtension: null,
      });
      const movie = exportPlaybackUrl(
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
        false
      );
      assert.equal(live, "http://209.237.141.15:8080/live/demo/pass/live123.ts");
      assert.equal(movie, "http://45.88.138.18/movie/demo/pass/movie123.mkv");
    } finally {
      if (previous == null) delete process.env.NEXLIFY_MEDIA_ORIGIN;
      else process.env.NEXLIFY_MEDIA_ORIGIN = previous;
    }
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

  it("does not advertise HLS for live auto when origin is m3u8 — MPEG-TS unless the client asked", () => {
    const url = exportPlaybackUrl(
      baseUrl,
      line,
      {
        id: "live123",
        type: "LIVE",
        streamUrl: "http://upstream/live.m3u8",
        containerExtension: null,
      },
      {
        id: "live123",
        type: "LIVE",
        streamUrl: "http://upstream/live.m3u8",
        playlistUrl: null,
        backupUrl: null,
        containerExtension: null,
      } as never,
      undefined,
      "auto"
    );
    assert.equal(url, "http://45.88.138.18/live/demo/pass/live123.ts");
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

  it("MAG live URLs stay on the panel HTTP origin, not the media IP", () => {
    const previous = process.env.NEXLIFY_MEDIA_ORIGIN;
    process.env.NEXLIFY_MEDIA_ORIGIN = "http://209.237.141.15:8080";
    try {
      const origin = magHttpPlaybackOrigin("https://darkcdn.store");
      assert.equal(origin, "http://darkcdn.store");
      const url = exportPlaybackUrl(
        origin,
        line,
        {
          id: "live123",
          type: "LIVE",
          streamUrl: "http://upstream/live.ts",
          containerExtension: null,
        },
        undefined,
        undefined,
        "ts",
        false,
        true
      );
      assert.equal(url, "http://darkcdn.store/live/demo/pass/live123.ts");
    } finally {
      if (previous == null) delete process.env.NEXLIFY_MEDIA_ORIGIN;
      else process.env.NEXLIFY_MEDIA_ORIGIN = previous;
    }
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
