import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMediaByteWindow,
  computeConnectionQualityWithLive,
  ON_DEMAND_PLAYER_STALL_IDLE_MS,
} from "./connection-quality-live";
import { describeStallCount } from "./connection-quality";

test("describeStallCount maps 0 / 1–4 / 5+ for operators", () => {
  assert.equal(describeStallCount(0).level, "ok");
  assert.equal(describeStallCount(1).level, "watch");
  assert.equal(describeStallCount(4).level, "watch");
  assert.equal(describeStallCount(5).level, "bad");
  assert.match(describeStallCount(0).summary, /normal/);
  assert.match(describeStallCount(5).summary, /buffering/);
});

test("computeConnectionQualityWithLive uses throughput when samples exist", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 120_000),
    lastSeenAt: new Date(now - 2_000),
    now,
    live: {
      bytesPerSec: 500_000,
      lastByteAt: now - 1_000,
      totalBytes: 50_000_000,
      stallSec: 1,
      stallCount: 0,
      firstByteAt: now - 119_000,
      hasSamples: true,
    },
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 95);
});

test("computeConnectionQualityWithLive — HLS gap between segments stays green", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 120_000),
    lastSeenAt: new Date(now - 8_000),
    now,
    live: {
      bytesPerSec: 400_000,
      lastByteAt: now - 18_000,
      totalBytes: 10_000_000,
      stallSec: 18,
      stallCount: 1,
      firstByteAt: now - 119_000,
      hasSamples: true,
    },
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 95);
});

test("computeConnectionQualityWithLive — stale byte window does not downgrade active session", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 120_000),
    lastSeenAt: new Date(now - 10_000),
    now,
    live: {
      bytesPerSec: 400_000,
      lastByteAt: now - 120_000,
      totalBytes: 10_000_000,
      stallSec: 120,
      stallCount: 2,
      firstByteAt: now - 119_000,
      hasSamples: true,
    },
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 90);
});

test("computeConnectionQualityWithLive marks disconnected sessions poor", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 60_000),
    lastSeenAt: new Date(now - 310_000),
    now,
    live: {
      bytesPerSec: 400_000,
      lastByteAt: now - 120_000,
      totalBytes: 10_000_000,
      stallSec: 120,
      stallCount: 2,
      firstByteAt: now - 119_000,
      hasSamples: true,
    },
  });
  assert.equal(q.level, "poor");
});

test("computeConnectionQualityWithLive treats fresh lastSeen as active when no byte samples", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 120_000),
    lastSeenAt: new Date(now - 3_000),
    now,
    live: null,
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 95);
});

test("computeConnectionQualityWithLive — new session starts green not yellow", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 3_000),
    lastSeenAt: new Date(now - 1_000),
    now,
    live: null,
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 98);
});

test("applyMediaByteWindow counts a stall after a long byte gap", () => {
  const t0 = 1_000_000;
  const first = applyMediaByteWindow(null, t0, 188);
  assert.equal(first.stallCount, 0);
  assert.equal(first.firstByteAt, t0);
  const later = applyMediaByteWindow(first, t0 + 800, 188);
  assert.equal(later.stallCount, 0);
  const stalled = applyMediaByteWindow(later, t0 + 50_000, 188);
  assert.equal(stalled.stallCount, 1);
  assert.equal(stalled.firstByteAt, t0);
});

test("applyMediaByteWindow does not treat a delayed full video pulse as a stall", () => {
  const t0 = 1_000_000;
  const first = applyMediaByteWindow(null, t0, 220_000);
  const batched = applyMediaByteWindow(first, t0 + 30_000, 2_000_000);
  assert.equal(batched.stallCount, 0);
});

test("applyMediaByteWindow counts a stall when the edge reports player-visible origin idle", () => {
  const t0 = 1_000_000;
  const first = applyMediaByteWindow(null, t0, 220_000);
  const stalled = applyMediaByteWindow(first, t0 + 15_000, 2_000_000, 7_000);
  assert.equal(stalled.stallCount, 1);
});

test("applyMediaByteWindow resets stall count after a long idle (new spell)", () => {
  const t0 = 1_000_000;
  const first = applyMediaByteWindow(null, t0, 188);
  const stalled = applyMediaByteWindow(first, t0 + 50_000, 188);
  assert.equal(stalled.stallCount, 1);
  const resumed = applyMediaByteWindow(stalled, t0 + 200_000, 220_000);
  assert.equal(resumed.stallCount, 0);
  assert.equal(resumed.firstByteAt, t0 + 200_000);
});

test("applyMediaByteWindow ignores on-demand spin-up idle during warmup", () => {
  const t0 = 1_000_000;
  const first = applyMediaByteWindow(null, t0, 120_000, 0, true);
  const spinUp = applyMediaByteWindow(first, t0 + 15_000, 180_000, 7_000, true);
  assert.equal(spinUp.stallCount, 0);
});

test("applyMediaByteWindow counts on-demand stall only above on-demand idle threshold", () => {
  const t0 = 1_000_000;
  const warmed = applyMediaByteWindow(null, t0, 600_000, 0, true);
  const below = applyMediaByteWindow(warmed, t0 + 60_000, 2_000_000, ON_DEMAND_PLAYER_STALL_IDLE_MS - 500, true);
  assert.equal(below.stallCount, 0);
  const stalled = applyMediaByteWindow(below, t0 + 75_000, 2_000_000, ON_DEMAND_PLAYER_STALL_IDLE_MS + 500, true);
  assert.equal(stalled.stallCount, 1);
});
