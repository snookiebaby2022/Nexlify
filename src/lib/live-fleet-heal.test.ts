import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBadLiveHostUrl,
  liveHostScore,
  liveQualityKey,
  liveQualityRank,
  liveUpstreamKey,
} from "./live-fleet-heal";
import { isProbeHealthy, isProbeStarved, LIVE_STARVED_KBPS } from "./live-starved-failover";

describe("live-fleet-heal keys", () => {
  it("collapses FHD/HD/SD quality labels", () => {
    assert.equal(liveQualityKey("Sky Sports Football FHD"), liveQualityKey("Sky Sports Football HD"));
    assert.equal(liveQualityKey("Sky Sports Football SD"), liveQualityKey("Sky Sports Football HEVC LB (1080p)"));
    assert.equal(liveQualityRank("Foo FHD") > liveQualityRank("Foo HD"), true);
  });

  it("scores preferred hosts and flags bad ones", () => {
    assert.equal(isBadLiveHostUrl("http://tinypanel.info:8080/a/b/1"), true);
    assert.equal(isBadLiveHostUrl("http://xplatinmedia.com/x"), true);
    assert.equal(isBadLiveHostUrl("http://junki3monk3y.com/Blade2nd/x/753"), false);
    assert.ok(liveHostScore("http://junki3monk3y.com/a") > liveHostScore("http://other.example/a"));
    assert.equal(
      liveUpstreamKey("http://Junki3Monk3y.com/Blade2nd/x/753?tok=1"),
      "http://junki3monk3y.com/Blade2nd/x/753"
    );
  });
});

describe("live-starved-failover", () => {
  it("detects starved vs healthy probes", () => {
    assert.equal(isProbeStarved({ status: "offline" }), true);
    assert.equal(isProbeStarved({ status: "online", bitrateKbps: 500 }), true);
    assert.equal(isProbeStarved({ status: "online", bitrateKbps: LIVE_STARVED_KBPS }), false);
    assert.equal(isProbeStarved({ status: "online", bitrateKbps: 8000 }), false);
    assert.equal(isProbeHealthy({ status: "online", bitrateKbps: 8000 }), true);
    assert.equal(isProbeHealthy({ status: "online", bitrateKbps: 400 }), false);
    assert.equal(isProbeHealthy({ status: "online" }), true);
  });
});
