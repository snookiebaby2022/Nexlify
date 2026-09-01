import assert from "node:assert/strict";
import test from "node:test";
import {
  applySourceProbe,
  CIRCUIT_RECOVERY_AFTER_MS,
  emptySourceCircuit,
  rankSourceCandidates,
} from "./source-circuit-breaker";

test("applySourceProbe opens after repeated failures", () => {
  let state = emptySourceCircuit();
  for (let i = 0; i < 3; i++) {
    state = applySourceProbe(state, {
      ok: false,
      error: "upstream unavailable",
      now: 1_000 + i,
    });
  }
  assert.equal(state.state, "open");
  assert.equal(state.failures, 3);
  assert.equal(state.openedAt, 1_002);
  assert.equal(state.lastError, "upstream unavailable");
});

test("successful recovery probe closes an open circuit", () => {
  const openedAt = 10_000;
  const open = {
    ...emptySourceCircuit(),
    state: "open" as const,
    failures: 3,
    openedAt,
  };
  const recovered = applySourceProbe(open, {
    ok: true,
    latencyMs: 75,
    now: openedAt + CIRCUIT_RECOVERY_AFTER_MS,
  });
  assert.equal(recovered.state, "closed");
  assert.equal(recovered.failures, 0);
  assert.equal(recovered.openedAt, null);
  assert.equal(recovered.latencyMs, 75);
});

test("failed recovery probe reopens from half_open", () => {
  const openedAt = 10_000;
  const halfOpen = {
    ...emptySourceCircuit(),
    state: "half_open" as const,
    failures: 3,
    openedAt,
  };
  const retryAt = openedAt + CIRCUIT_RECOVERY_AFTER_MS;
  const failed = applySourceProbe(halfOpen, { ok: false, now: retryAt });
  assert.equal(failed.state, "open");
  assert.equal(failed.openedAt, retryAt);
});

test("rankSourceCandidates prefers closed and low-latency sources", () => {
  const ranked = rankSourceCandidates([
    { url: "https://slow.example/live", state: "closed", latencyMs: 900 },
    { url: "https://open.example/live", state: "open", failures: 8, latencyMs: 20 },
    { url: "https://fast.example/live", state: "closed", latencyMs: 100 },
  ]);
  assert.deepEqual(ranked.map((x) => x.url), [
    "https://fast.example/live",
    "https://slow.example/live",
  ]);
});

test("rankSourceCandidates uses open sources only when all are open", () => {
  const ranked = rankSourceCandidates([
    { url: "https://a.example/live", state: "open", failures: 3 },
    { url: "https://b.example/live", state: "open", failures: 1 },
  ]);
  assert.equal(ranked[0]?.url, "https://b.example/live");
});
