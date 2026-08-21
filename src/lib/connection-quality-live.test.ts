import assert from "node:assert/strict";
import test from "node:test";
import { computeConnectionQualityWithLive } from "./connection-quality-live";

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
