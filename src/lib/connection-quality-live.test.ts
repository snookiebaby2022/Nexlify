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
  assert.ok(q.score >= 80);
});

test("computeConnectionQualityWithLive marks stalled streams poor", () => {
  const now = Date.now();
  const q = computeConnectionQualityWithLive({
    startedAt: new Date(now - 60_000),
    lastSeenAt: new Date(now - 5_000),
    now,
    live: {
      bytesPerSec: 400_000,
      lastByteAt: now - 15_000,
      totalBytes: 10_000_000,
      stallSec: 15,
      hasSamples: true,
    },
  });
  assert.equal(q.level, "poor");
});
