import assert from "node:assert/strict";
import test from "node:test";
import { isIptvTrialDurationDays, isIptvTrialSubscription } from "./iptv-trial-lines";

test("24h and 48h durations are IPTV trials; longer packages are not", () => {
  assert.equal(isIptvTrialDurationDays(1), true);
  assert.equal(isIptvTrialDurationDays(2), true);
  assert.equal(isIptvTrialDurationDays(7), false);
  assert.equal(isIptvTrialDurationDays(30), false);
});

test("isIptvTrialSubscription matches flag, 1–2 days, or remaining ≤ 49h", () => {
  assert.equal(isIptvTrialSubscription({ isTrial: true, days: 30 }), true);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 1 }), true);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 2 }), true);
  assert.equal(isIptvTrialSubscription({ isTrial: false, days: 7 }), false);

  const now = new Date("2026-08-27T12:00:00.000Z");
  const in48h = new Date(now.getTime() + 48 * 3600000);
  const in7d = new Date(now.getTime() + 7 * 86400000);
  assert.equal(isIptvTrialSubscription({ expiresAt: in48h, now }), true);
  assert.equal(isIptvTrialSubscription({ expiresAt: in7d, now }), false);
});
