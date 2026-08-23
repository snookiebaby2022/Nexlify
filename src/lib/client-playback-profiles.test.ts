import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectClientProfile,
  preferLiveOutputFormats,
  resolveClientPlaybackProfile,
} from "./client-playback-profiles";

describe("client playback profiles", () => {
  it("detects XCIPTV and Smarters from User-Agent", () => {
    assert.equal(detectClientProfile("XCIPTV/5.0.0"), "xciptv");
    assert.equal(detectClientProfile("IPTVSmartersPlayer"), "smarters");
  });

  it("does not prefetch streams during XCIPTV catalog updates", () => {
    const profile = resolveClientPlaybackProfile("XCIPTV/5.0.0");
    assert.equal(profile.zapPrefetchOnPlaylist, false);
    assert.equal(profile.liveOutput, "ts");
  });

  it("puts mpegts first for XCIPTV so players open .ts not .m3u8", () => {
    const profile = resolveClientPlaybackProfile("XCIPTV/5.0.0");
    assert.deepEqual(preferLiveOutputFormats(["m3u8", "ts", "rtmp"], profile), ["ts", "m3u8", "rtmp"]);
  });

  it("leaves Smarters on auto output order (HLS-capable) and does not catalog-prefetch", () => {
    const profile = resolveClientPlaybackProfile("IPTV Smarters Pro");
    assert.deepEqual(preferLiveOutputFormats(["m3u8", "ts", "rtmp"], profile), ["m3u8", "ts", "rtmp"]);
    assert.equal(profile.zapPrefetchOnPlaylist, false);
  });
});
