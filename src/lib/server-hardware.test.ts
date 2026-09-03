import assert from "node:assert/strict";
import test from "node:test";
import { cpuPercentFromSnapshots } from "./server-hardware";

test("cpu percentage uses elapsed busy time instead of load average", () => {
  assert.equal(
    cpuPercentFromSnapshots(
      { idle: 1_000, total: 2_000 },
      { idle: 1_750, total: 3_000 }
    ),
    25
  );
});

test("cpu percentage rejects snapshots without elapsed CPU time", () => {
  assert.equal(
    cpuPercentFromSnapshots(
      { idle: 1_000, total: 2_000 },
      { idle: 1_000, total: 2_000 }
    ),
    null
  );
});
