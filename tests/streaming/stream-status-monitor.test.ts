import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySourceProbe,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_RECOVERY_AFTER_MS,
  emptySourceCircuit,
  rankSourceCandidates,
} from "../../src/lib/source-circuit-breaker";
import {
  classifyProbeFailure,
  formatProbeFailure,
} from "../../src/lib/stream-provider-probe";
import { decideProbePersist } from "../../src/lib/stream-probe-persist";
import {
  isLiveOriginOrSpliceFailed,
  liveOriginOrSpliceError,
} from "../../src/lib/stream-health-fail";

describe("stream status monitor — probe classification", () => {
  it("maps online / offline / timeout / auth failures to stable reason codes", () => {
    assert.equal(classifyProbeFailure("ok", 200), "error");
    assert.equal(classifyProbeFailure("Timed out after 8s"), "timeout");
    assert.equal(classifyProbeFailure("request timed out"), "timeout");
    assert.equal(classifyProbeFailure("ENOTFOUND upstream", undefined), "dns");
    assert.equal(classifyProbeFailure("forbidden", 403), "403");
    assert.equal(classifyProbeFailure("gateway", 502), "502");
    assert.equal(classifyProbeFailure("missing", 404), "404");
  });

  it("formats offline probes with bracketed reason for dashboards", () => {
    assert.equal(
      formatProbeFailure({
        status: "offline",
        message: "Timed out after 8s",
        failureReason: "timeout",
      }),
      "[timeout] Timed out after 8s"
    );
  });

  it("persists online as healthy and offline only on full probes (not fast HEAD)", () => {
    assert.deepEqual(
      decideProbePersist({
        probe: { status: "online" },
      }),
      { skipped: false, write: true, lastProbeOk: true, lastProbeError: null }
    );

    assert.deepEqual(
      decideProbePersist({
        probe: { status: "offline", message: "timeout" },
        fast: true,
      }),
      { skipped: false, write: false }
    );

    assert.deepEqual(
      decideProbePersist({
        probe: { status: "offline", message: "timeout" },
        fast: false,
      }),
      {
        skipped: false,
        write: true,
        lastProbeOk: false,
        lastProbeError: "timeout",
      }
    );

    const degraded = decideProbePersist({
      probe: { status: "degraded", message: "Auth required (HTTP 401)" },
    });
    assert.equal(degraded.lastProbeOk, true);
    assert.match(String(degraded.lastProbeError), /Auth required/);
  });

  it("treats skipped circuit probes as no-op writes", () => {
    assert.deepEqual(
      decideProbePersist({
        skipped: true,
        probe: { status: "offline", message: "Circuit open" },
      }),
      { skipped: true, write: false }
    );
  });
});

describe("stream status monitor — restarting (circuit recovery)", () => {
  it("opens after failures; successful recovery probe closes (restart complete)", () => {
    let state = emptySourceCircuit();
    const t0 = 1_000_000;
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) {
      state = applySourceProbe(state, {
        ok: false,
        error: "upstream 522",
        now: t0 + i,
      });
    }
    assert.equal(state.state, "open");
    assert.equal(state.openedAt, t0 + CIRCUIT_FAILURE_THRESHOLD - 1);

    // half_open = restarting / recovery probe in flight
    const restarting = {
      ...state,
      state: "half_open" as const,
    };
    const failedRestart = applySourceProbe(restarting, {
      ok: false,
      error: "still down",
      now: t0 + CIRCUIT_RECOVERY_AFTER_MS,
    });
    assert.equal(failedRestart.state, "open");

    const recovered = applySourceProbe(restarting, {
      ok: true,
      latencyMs: 40,
      now: t0 + CIRCUIT_RECOVERY_AFTER_MS,
    });
    assert.equal(recovered.state, "closed");
    assert.equal(recovered.failures, 0);
  });
});

describe("stream status monitor — source failover ranking", () => {
  it("prefers closed low-latency backup over open primary", () => {
    const ranked = rankSourceCandidates([
      { url: "https://primary.example/live", state: "open", failures: 5, latencyMs: 20 },
      { url: "https://backup.example/live", state: "closed", latencyMs: 80, priority: 2 },
      { url: "https://backup2.example/live", state: "closed", latencyMs: 200, priority: 1 },
    ]);
    assert.equal(ranked[0]?.url, "https://backup.example/live");
    assert.ok(!ranked.some((r) => r.url.includes("primary")));
  });

  it("falls back to least-failed open source when every source is down", () => {
    const ranked = rankSourceCandidates([
      { url: "https://a.example/live", state: "open", failures: 9 },
      { url: "https://b.example/live", state: "open", failures: 2 },
    ]);
    assert.equal(ranked[0]?.url, "https://b.example/live");
  });
});

describe("stream status monitor — origin/splice offline", () => {
  it("flags splice and origin probe failures as offline for Issues", () => {
    assert.equal(
      isLiveOriginOrSpliceFailed({
        lastProbeOk: true,
        lastProbeError: null,
        lastSpliceOk: false,
      }),
      true
    );
    assert.equal(
      liveOriginOrSpliceError({
        lastProbeError: null,
        lastSpliceError: "Splice: timeout",
      }),
      "Splice: timeout"
    );
  });
});
