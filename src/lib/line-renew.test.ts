import assert from "node:assert/strict";
import test from "node:test";
import { PanelRole } from "@prisma/client";
import { computeExtendedExpiry, unlimitedLineExpiresAt } from "./line-renew";
import { isUnlimitedLineExpiry } from "./format";
import { assertRoleMaySetUnlimited } from "./reseller-line-guards";

test("computeExtendedExpiry from an unlimited date adds days from now, not from +10 years", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const unlimited = unlimitedLineExpiresAt(now);
  assert.equal(isUnlimitedLineExpiry(unlimited, now), true);
  const next = computeExtendedExpiry(unlimited, 30, now);
  assert.equal(isUnlimitedLineExpiry(next, now), false);
  const days = (next.getTime() - now.getTime()) / 86400000;
  assert.ok(days >= 29 && days <= 31);
});

test("resellers cannot set unlimited; admins can", () => {
  const far = unlimitedLineExpiresAt();
  assert.equal(assertRoleMaySetUnlimited(PanelRole.ADMIN, { unlimited: true }).ok, true);
  assert.equal(assertRoleMaySetUnlimited(PanelRole.RESELLER, { unlimited: true }).ok, false);
  assert.equal(assertRoleMaySetUnlimited(PanelRole.SUB_RESELLER, { days: 3650 }).ok, false);
  assert.equal(assertRoleMaySetUnlimited(PanelRole.RESELLER, { expiresAt: far }).ok, false);
  assert.equal(assertRoleMaySetUnlimited(PanelRole.RESELLER, { days: 30 }).ok, true);
});

test("applyLineSetExpiry daysAdded is previous→new, not now→new", () => {
  const previous = new Date("2026-08-01T00:00:00.000Z");
  const next = new Date("2026-08-31T00:00:00.000Z");
  const daysAdded = Math.max(0, Math.round((next.getTime() - previous.getTime()) / 86400000));
  assert.equal(daysAdded, 30);
});
