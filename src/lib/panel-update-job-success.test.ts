import assert from "node:assert/strict";
import { looksLikeSuccessfulUpdateDespiteWorkerExit, type PanelUpdateJob } from "@/lib/panel-update-job";

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
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 48, currentStep: "npm run build" })),
  false
);
assert.equal(
  looksLikeSuccessfulUpdateDespiteWorkerExit(base({ progress: 14, currentStep: "git pull" })),
  false
);

console.log("panel-update-job-success.test.ts: ok");
