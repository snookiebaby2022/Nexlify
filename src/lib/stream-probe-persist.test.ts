import assert from "node:assert/strict";
import { test } from "node:test";
import { decideProbePersist } from "./stream-probe-persist";

test("skipped probes do not persist", () => {
  const d = decideProbePersist({
    skipped: true,
    fast: true,
    probe: { status: "offline", message: "pool" },
  });
  assert.equal(d.write, false);
});

test("fast HEAD failure does not persist a fail", () => {
  const d = decideProbePersist({
    fast: true,
    probe: { status: "offline", message: "HEAD 405" },
  });
  assert.equal(d.write, false);
});

test("full probe failure persists fail", () => {
  const d = decideProbePersist({
    fast: false,
    probe: { status: "offline", message: "timeout" },
  });
  assert.equal(d.write, true);
  assert.equal(d.lastProbeOk, false);
  assert.equal(d.lastProbeError, "timeout");
});

test("success clears probe fail even when fast", () => {
  const d = decideProbePersist({
    fast: true,
    probe: { status: "online" },
  });
  assert.equal(d.write, true);
  assert.equal(d.lastProbeOk, true);
  assert.equal(d.lastProbeError, null);
});
