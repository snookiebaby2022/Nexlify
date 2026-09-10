import assert from "node:assert/strict";
import test from "node:test";
import {
  isIptvTrialPackageMeta,
  isIptvTrialDurationDays,
  IPTV_TRIALS_DISABLED_ERROR,
} from "./iptv-trial-lines";

test("isIptvTrialDurationDays accepts 1 and 2 day trials", () => {
  assert.equal(isIptvTrialDurationDays(1), true);
  assert.equal(isIptvTrialDurationDays(2), true);
  assert.equal(isIptvTrialDurationDays(30), false);
});

test("isIptvTrialPackageMeta treats named trial as trial even if paid", () => {
  assert.equal(
    isIptvTrialPackageMeta({ name: "Free Trial", days: 1, creditCost: 0 }),
    true
  );
});

test("isIptvTrialPackageMeta ignores paid short packages without trial name", () => {
  assert.equal(
    isIptvTrialPackageMeta({ name: "1 Day", days: 1, creditCost: 5 }),
    false
  );
});

test("trial disabled error string is stable", () => {
  assert.match(IPTV_TRIALS_DISABLED_ERROR, /disabled/i);
});
