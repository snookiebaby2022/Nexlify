import assert from "node:assert/strict";
import {
  computeClientUpdateRunning,
  installedVersionImpliesUpdateSuccess,
  looksLikeSuccessfulUpdateDespiteWorkerExit,
  promoteJobToDone,
  type PanelUpdateJob,
} from "@/lib/panel-update-job";

function base(partial: Partial<PanelUpdateJob>): PanelUpdateJob {
  return {
    status: "running",
    progress: 50,
    currentStep: "npm run build",
    steps: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
    fromVersion: "1.9.92",
    toVersion: "1.9.94",
    ...partial,
  };
}

assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 98, currentStep: "pm2 restart nexlify" })),
  true
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 94, currentStep: "prepare standalone" })),
  true
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(
    base({
      progress: 90,
      currentStep: null,
      steps: [{ name: "pm2 restart nexlify", ok: true, status: "done" }],
    })
  ),
  true
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 88, currentStep: "apply update" })),
  true
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 88, currentStep: "npm run build" })),
  false
);

assert.equal(
  computeClientUpdateRunning(
    { ...base({ status: "done", progress: 100, currentStep: null }), status: "done" },
    true
  ),
  false
);

{
  const promoted = promoteJobToDone(
    base({
      progress: 88,
      currentStep: "apply update",
      steps: [{ name: "apply update", ok: false, status: "running" }],
    }),
    "ok"
  );
  assert.equal(promoted.status, "done");
  assert.equal(promoted.progress, 100);
  assert.equal(promoted.steps[0]?.status, "done");
  assert.equal(promoted.steps[0]?.ok, true);
}
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 90, currentStep: "prepare standalone" })),
  true
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 48, currentStep: "npm run build" })),
  false
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 14, currentStep: "git pull" })),
  false
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 60, currentStep: "npm run build" })),
  false
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(
    base({
      progress: 96,
      currentStep: "pm2 restart nexlify",
      steps: [{ name: "npm run build", ok: false, status: "failed" }],
    })
  ),
  false
);

// package.json on the target only counts when the job is actually moving versions
assert.equal(
  installedVersionImpliesUpdateSuccess(base({ progress: 60, currentStep: "npm run build" }), "1.9.94"),
  true
);
assert.equal(
  installedVersionImpliesUpdateSuccess(base({ progress: 60, currentStep: "npm run build" }), "1.9.96"),
  true
);
assert.equal(
  installedVersionImpliesUpdateSuccess(base({ progress: 60, currentStep: "npm run build" }), "1.9.92"),
  false
);
assert.equal(
  installedVersionImpliesUpdateSuccess(
    base({ progress: 60, toVersion: null, fromVersion: "1.9.90" }),
    "1.9.93"
  ),
  true
);
assert.equal(
  installedVersionImpliesUpdateSuccess(
    base({ fromVersion: "2.0.65", toVersion: "2.0.65", progress: 8, currentStep: "Starting update…" }),
    "2.0.65"
  ),
  false
);

console.log("panel-update-job-success.test.ts: ok");
