import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardPlaybackBandwidthMbps,
  estimatedLiveBandwidthMbps,
  loadScorePercent,
  preferHeadroomPool,
  serverEgressHeadroom,
  viewerSlotsUsed,
} from "./server-load-metrics";

describe("server load scoring", () => {
  it("does not treat catalog assignment as connections", () => {
    assert.equal(viewerSlotsUsed(0, 0), 0);
    assert.equal(viewerSlotsUsed(12, 3), 12);
    assert.equal(viewerSlotsUsed(2, 8), 8);
  });

  it("scores load against max clients, not catalog size", () => {
    assert.equal(loadScorePercent(47621, 1000), 4762);
    assert.equal(loadScorePercent(0, 1000), 0);
    assert.equal(loadScorePercent(50, 1000), 5);
  });

  it("estimates mbps from process bitrate or ~2.5 per connection", () => {
    assert.equal(estimatedLiveBandwidthMbps(10, 0), 25);
    assert.equal(estimatedLiveBandwidthMbps(10, 8000), 8);
    assert.equal(estimatedLiveBandwidthMbps(0, 8000), 0);
  });

  it("zeros dashboard bandwidth when nobody is watching", () => {
    const idle = dashboardPlaybackBandwidthMbps(0, 19100);
    assert.equal(idle.networkInMbps, 0);
    assert.equal(idle.networkOutMbps, 0);
    const live = dashboardPlaybackBandwidthMbps(4, 0);
    assert.equal(live.networkOutMbps, 10);
  });

  it("flags a box as saturated when egress or slots are exhausted", () => {
    const full = serverEgressHeadroom({ usedMbps: 960, nicCapMbps: 1000, slotRatio: 0.4 });
    assert.equal(full.saturated, true);
    assert.equal(full.headroomMbps, 40);
    const slots = serverEgressHeadroom({ usedMbps: 100, nicCapMbps: 1000, slotRatio: 0.95 });
    assert.equal(slots.saturated, true);
    const ok = serverEgressHeadroom({ usedMbps: 200, nicCapMbps: 1000, slotRatio: 0.2 });
    assert.equal(ok.saturated, false);
    assert.equal(ok.headroomPct, 80);
  });

  it("keeps assigning only when every online box is already saturated", () => {
    const pool = preferHeadroomPool([
      { online: true, saturated: true, id: "a" },
      { online: true, saturated: false, id: "b" },
      { online: false, saturated: false, id: "c" },
    ]);
    assert.deepEqual(pool.map((x) => x.id), ["b"]);
    const allFull = preferHeadroomPool([
      { online: true, saturated: true, id: "a" },
      { online: true, saturated: true, id: "b" },
    ]);
    assert.equal(allFull.length, 2);
  });
});
