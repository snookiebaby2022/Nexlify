import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bufferingRisk,
  preferHeadroomPool,
  serverEgressHeadroom,
} from "../../src/lib/server-load-metrics";
import { shouldKeepStickyLineLb } from "../../src/lib/server-load";

describe("load balancer selection", () => {
  it("picks unsaturated online boxes before saturated ones", () => {
    const pool = preferHeadroomPool([
      { id: "a", online: true, saturated: true },
      { id: "b", online: true, saturated: false },
      { id: "c", online: false, saturated: false },
    ]);
    assert.deepEqual(
      pool.map((x) => x.id),
      ["b"]
    );
  });

  it("returns empty when every server is down", () => {
    const pool = preferHeadroomPool([
      { id: "a", online: false, saturated: false },
      { id: "b", online: false, saturated: true },
    ]);
    assert.deepEqual(pool, []);
    assert.equal(bufferingRisk({ online: false, saturated: false, headroomPct: 100, loadPct: 0 }), "critical");
  });

  it("still assigns among online boxes when all are saturated", () => {
    const pool = preferHeadroomPool([
      { id: "a", online: true, saturated: true },
      { id: "b", online: true, saturated: true },
    ]);
    assert.equal(pool.length, 2);
  });

  it("drops sticky assignment when preferred LB is offline / degraded / down", () => {
    for (const healthStatus of ["offline", "degraded", "down"] as const) {
      assert.equal(
        shouldKeepStickyLineLb({
          preferredActive: true,
          healthStatus,
          role: "lb",
          hasMediaEndpoint: true,
        }),
        false,
        healthStatus
      );
    }
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "lb",
        hasMediaEndpoint: true,
      }),
      true
    );
  });

  it("never keeps sticky on Main or inactive / media-less servers", () => {
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: false,
        healthStatus: "online",
        role: "lb",
        hasMediaEndpoint: true,
      }),
      false
    );
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "main",
        hasMediaEndpoint: true,
      }),
      false
    );
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "lb",
        hasMediaEndpoint: false,
      }),
      false
    );
  });

  it("marks exhausted egress as saturated so selection prefers headroom", () => {
    const full = serverEgressHeadroom({ usedMbps: 960, nicCapMbps: 1000, slotRatio: 0.4 });
    assert.equal(full.saturated, true);
    const pool = preferHeadroomPool([
      { id: "full", online: true, saturated: full.saturated },
      { id: "ok", online: true, saturated: false },
    ]);
    assert.deepEqual(
      pool.map((x) => x.id),
      ["ok"]
    );
  });
});
