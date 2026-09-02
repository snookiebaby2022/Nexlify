import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectClientProfile,
  preferLiveOutputFormats,
  resolveClientPlaybackProfile,
  userAgentAllowsInstantTsWrap,
  userAgentIsVlcEngine,
  userAgentWantsHlsPlaylist,
} from "./client-playback-profiles";

describe("client playback profiles", () => {
  it("detects Nexus TV and Lavf as TS clients without playlist prefetch", () => {
    const nexus = resolveClientPlaybackProfile("NexusTV/1.0");
    assert.equal(nexus.id, "nexus");
    assert.equal(nexus.liveOutput, "ts");
    assert.equal(nexus.zapPrefetchOnPlaylist, false);
    const lavf = resolveClientPlaybackProfile("Lavf/58.29.100");
    assert.equal(lavf.id, "nexus");
    assert.equal(lavf.zapPrefetchOnPlaylist, false);
  });

  it("detects XCIPTV and Smarters from User-Agent", () => {
    assert.equal(detectClientProfile("XCIPTV/5.0.0"), "xciptv");
    assert.equal(detectClientProfile("IPTVSmartersPlayer"), "smarters");
    assert.equal(detectClientProfile("okhttp/4.12.0 IPTV Smarters Pro"), "smarters");
    assert.equal(
      detectClientProfile(
        "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/87.0.4280.88 Safari/537.36 WebAppManager"
      ),
      "auto"
    );
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

  it("puts mpegts first for Smarters so PC VLC opens .ts not fake HLS", () => {
    const profile = resolveClientPlaybackProfile("IPTV Smarters Pro");
    assert.equal(profile.liveOutput, "ts");
    assert.deepEqual(preferLiveOutputFormats(["m3u8", "ts", "rtmp"], profile), ["ts", "m3u8", "rtmp"]);
    assert.equal(profile.zapPrefetchOnPlaylist, false);
  });

  it("detects built-in VLC separately from ExoPlayer", () => {
    assert.equal(userAgentIsVlcEngine("VLC/3.0.20 LibVLC/3.0.20"), true);
    assert.equal(userAgentIsVlcEngine("ExoPlayerLib/2.19.1"), false);
  });

  it("never treats .m3u8 as MPEG-TS — XUI/1-stream always serve an HLS playlist on that URL", () => {
    assert.equal(userAgentWantsHlsPlaylist("IPTVSmartersPlayer"), true);
    assert.equal(userAgentWantsHlsPlaylist("VLC/3.0.20 LibVLC/3.0.20"), true);
    assert.equal(userAgentWantsHlsPlaylist("XCIPTV/5.0.0"), true);
  });

  it("allows instant TS-wrap only for Exo/Chrome — Smarters/VLC need real HLS", () => {
    assert.equal(userAgentAllowsInstantTsWrap("ExoPlayerLib/2.19.1"), true);
    assert.equal(userAgentAllowsInstantTsWrap("Mozilla/5.0 Chrome/120.0.0.0"), true);
    assert.equal(
      userAgentAllowsInstantTsWrap(
        "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager"
      ),
      false
    );
    assert.equal(userAgentAllowsInstantTsWrap("IPTVSmartersPlayer"), false);
    assert.equal(userAgentAllowsInstantTsWrap("Mozilla/5.0 IPTV Smarters Pro"), false);
    assert.equal(userAgentAllowsInstantTsWrap("VLC/3.0.20 LibVLC/3.0.20"), false);
    assert.equal(userAgentAllowsInstantTsWrap("Lavf/58.76.100"), false);
    assert.equal(userAgentAllowsInstantTsWrap("XCIPTV/5.0.0 ExoPlayerLib/2.19.1"), true);
  });

  it("Smarters and XCIPTV VLC cannot play a fake HLS wrap", () => {
    assert.equal(userAgentIsVlcEngine("XCIPTV/5.0.0"), true);
    assert.equal(userAgentIsVlcEngine("Lavf/58.76.100"), true);
    assert.equal(userAgentIsVlcEngine("IPTVSmartersPlayer"), true);
    assert.equal(userAgentIsVlcEngine("Mozilla/5.0 IPTV Smarters Pro"), true);
  });
});
