import assert from "node:assert/strict";
import test from "node:test";
import { computeConnectionQuality } from "./connection-quality";

test("computeConnectionQuality — excellent for fresh stable session", () => {
  const now = Date.now();
  const q = computeConnectionQuality({
    startedAt: new Date(now - 600_000),
    lastSeenAt: new Date(now - 8_000),
    now,
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 80);
});

test("computeConnectionQuality — ok when heartbeat is aging", () => {
  const now = Date.now();
  const q = computeConnectionQuality({
    startedAt: new Date(now - 300_000),
    lastSeenAt: new Date(now - 40_000),
    now,
  });
  assert.equal(q.level, "ok");
  assert.ok(q.score >= 50 && q.score < 80);
});

test("computeConnectionQuality — poor when nearly stale", () => {
  const now = Date.now();
  const q = computeConnectionQuality({
    startedAt: new Date(now - 30_000),
    lastSeenAt: new Date(now - 115_000),
    now,
  });
  assert.equal(q.level, "poor");
  assert.ok(q.score < 50);
});
