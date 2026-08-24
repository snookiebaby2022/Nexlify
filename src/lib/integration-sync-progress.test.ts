import assert from "node:assert/strict";
import test from "node:test";
import {
  isSyncJobActive,
  staleSyncFailure,
  SYNC_STALE_MS,
} from "./integration-sync-progress";
import type { IntegrationSyncProgress } from "./integration-sync-types";

function progress(patch: Partial<IntegrationSyncProgress>): IntegrationSyncProgress {
  return {
    jobId: "job",
    status: "running",
    phase: "import",
    message: "Working…",
    current: 1,
    total: 6,
    imported: 10,
    skipped: 20,
    steps: [],
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

test("isSyncJobActive is true for a fresh running job", () => {
  assert.equal(isSyncJobActive(progress({})), true);
});

test("isSyncJobActive is false when running progress is older than 2 minutes", () => {
  const old = progress({
    updatedAt: new Date(Date.now() - SYNC_STALE_MS - 1000).toISOString(),
  });
  assert.equal(isSyncJobActive(old), false);
});

test("isSyncJobActive is false for done or error", () => {
  assert.equal(isSyncJobActive(progress({ status: "done" })), false);
  assert.equal(isSyncJobActive(progress({ status: "error" })), false);
  assert.equal(isSyncJobActive(null), false);
});

test("staleSyncFailure tells the user to click Sync again after a mid-import stop", () => {
  const failed = staleSyncFailure(progress({ phase: "import" }));
  assert.equal(failed.status, "error");
  assert.match(failed.error ?? "", /stopped unexpectedly/i);
  assert.match(failed.error ?? "", /click sync/i);
});

test("staleSyncFailure for a queued job says the cron worker is not running", () => {
  const failed = staleSyncFailure(progress({ phase: "queued" }));
  assert.equal(failed.status, "error");
  assert.match(failed.error ?? "", /nexlify-cron/i);
});
