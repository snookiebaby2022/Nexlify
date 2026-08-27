import assert from "node:assert/strict";
import test from "node:test";
import {
  isIptvTrialDurationDays,
  isIptvTrialPackageMeta,
  isIptvTrialSubscription,
} from "./iptv-trial-lines";

test("24h and 48h durations are IPTV trial presets; longer packages are not", () => {
  assert.equal(isIptvTrialDurationDays(1), true);
  assert.equal(isIptvTrialDurationDays(2), true);
  assert.equal(isIptvTrialDurationDays(7), false);
  assert.equal(isIptvTrialDurationDays(30), false);
});

test("isIptvTrialSubscription uses the isTrial flag only", () => {
  assert.equal(isIptvTrialSubscription({ isTrial: true, days: 30 }), true);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 1 }), false);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 2 }), false);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 7 }), false);

  const now = new Date("2026-08-27T12:00:00.000Z");
  const in48h = new Date(now.getTime() + 48 * 3600000);
  assert.equal(isIptvTrialSubscription({ expiresAt: in48h, now }), false);
  assert.equal(isIptvTrialSubscription({ isTrial: true, expiresAt: in48h, now }), true);
});

test("paid short packages are not trials; free 1–2 day and named trial are", () => {
  assert.equal(isIptvTrialPackageMeta({ name: "1 day", days: 1, creditCost: 5, shopPriceCents: 0 }), false);
  assert.equal(isIptvTrialPackageMeta({ name: "1 day", days: 1, creditCost: 0, shopPriceCents: 999 }), false);
  assert.equal(isIptvTrialPackageMeta({ name: "1 day", days: 1, creditCost: 0, shopPriceCents: 0 }), true);
  assert.equal(isIptvTrialPackageMeta({ name: "Free trial", days: 7, creditCost: 0 }), true);
});
