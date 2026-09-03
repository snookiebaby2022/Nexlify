import assert from "node:assert/strict";
import {
  installedVersionImpliesUpdateSuccess,
  looksLikeSuccessfulUpdateDespiteWorkerExit,
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
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 88, currentStep: "npm run build" })),
  false
);
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

// Progress stuck at ~60% but package.json already on the new version → success
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

console.log("panel-update-job-success.test.ts: ok");
