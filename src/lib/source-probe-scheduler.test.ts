import assert from "node:assert/strict";
import test from "node:test";
import { probeJitterMs } from "./source-probe-scheduler";

test("probeJitterMs is deterministic and bounded", () => {
  const a = probeJitterMs("stream-abc", 60_000);
  const b = probeJitterMs("stream-abc", 60_000);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 60_000);
});

test("probeJitterMs differs across stream ids", () => {
  const a = probeJitterMs("stream-a", 10_000);
  const b = probeJitterMs("stream-b", 10_000);
  assert.notEqual(a, b);
});
