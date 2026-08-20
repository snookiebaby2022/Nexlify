import assert from "node:assert/strict";
import test from "node:test";
import {
  inferPlaybackOutputFromPath,
  inferPlaybackOutputFromUserAgent,
  resolvePlaybackOutputLabel,
} from "./connection-playback-output";

test("inferPlaybackOutputFromPath detects MPEGTS and HLS from Xtream URLs", () => {
  assert.equal(
    inferPlaybackOutputFromPath("/live/user/pass/1862838169.ts"),
    "MPEGTS"
  );
  assert.equal(
    inferPlaybackOutputFromPath("/live/user/pass/1862838169.m3u8"),
    "HLS"
  );
  assert.equal(
    inferPlaybackOutputFromPath("/live/user/pass/1862838169/hls/seg0.ts"),
    "HLS"
  );
});

test("inferPlaybackOutputFromUserAgent prefers VLC as MPEGTS", () => {
  assert.equal(inferPlaybackOutputFromUserAgent("VLC/3.0.20 LibVLC/3.0.20"), "MPEGTS");
  assert.equal(inferPlaybackOutputFromUserAgent("XCIPTV/5.0.0"), null);
});

test("resolvePlaybackOutputLabel prefers cached then path over UA", () => {
  assert.equal(
    resolvePlaybackOutputLabel({
      cached: "HLS",
      requestPath: "/live/u/p/1.ts",
      userAgent: "VLC/3.0.20",
    }),
    "HLS"
  );
  assert.equal(
    resolvePlaybackOutputLabel({
      requestPath: "/live/u/p/1.ts",
      userAgent: "XCIPTV/5.0.0",
    }),
    "MPEGTS"
  );
  assert.equal(
    resolvePlaybackOutputLabel({
      requestPath: "/live/u/p/1.m3u8",
      userAgent: "VLC/3.0.20",
    }),
    "HLS"
  );
});
