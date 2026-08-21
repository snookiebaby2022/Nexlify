import assert from "node:assert/strict";
import test from "node:test";
import { computeConnectionQuality, scoreFromLastSeen } from "./connection-quality";

test("scoreFromLastSeen — excellent while session is actively refreshing", () => {
  assert.ok(scoreFromLastSeen(2) >= 98);
  assert.ok(scoreFromLastSeen(10) >= 92);
  assert.ok(scoreFromLastSeen(20) >= 85);
});

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
    lastSeenAt: new Date(now - 95_000),
    now,
  });
  assert.equal(q.level, "ok");
  assert.ok(q.score >= 50 && q.score < 80);
});

test("computeConnectionQuality — poor when nearly stale", () => {
  const now = Date.now();
  const q = computeConnectionQuality({
    startedAt: new Date(now - 30_000),
    lastSeenAt: new Date(now - 310_000),
    now,
  });
  assert.equal(q.level, "poor");
  assert.ok(q.score < 50);
});

test("computeConnectionQuality — new session with fresh lastSeen is green", () => {
  const now = Date.now();
  const q = computeConnectionQuality({
    startedAt: new Date(now - 5_000),
    lastSeenAt: new Date(now - 2_000),
    now,
  });
  assert.equal(q.level, "excellent");
  assert.ok(q.score >= 95);
});
