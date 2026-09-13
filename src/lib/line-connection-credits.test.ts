import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PanelRole } from "@prisma/client";
import {
  applyResellerCreateConnections,
  assertRoleMaySetUnlimitedConnections,
  extraConnectionCreditCost,
  extraConnectionSlots,
  remainingLineDaysForCredits,
  RESELLER_UNLIMITED_CONNECTIONS_ERROR,
} from "./line-connection-pricing";

describe("extraConnectionSlots", () => {
  it("bills only the increase above the current cap", () => {
    assert.equal(extraConnectionSlots(1, 3), 2);
    assert.equal(extraConnectionSlots(2, 2), 0);
    assert.equal(extraConnectionSlots(4, 2), 0);
  });

  it("does not bill when converting unlimited down to a cap", () => {
    assert.equal(extraConnectionSlots(0, 2), 0);
  });

  it("ignores invalid or unlimited requested values", () => {
    assert.equal(extraConnectionSlots(2, 0), 0);
    assert.equal(extraConnectionSlots(2, Number.NaN), 0);
  });
});

describe("remainingLineDaysForCredits", () => {
  it("returns 0 for expired lines", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    assert.equal(remainingLineDaysForCredits(new Date("2026-09-01T12:00:00Z"), now), 0);
  });

  it("ceils remaining time to whole days", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    assert.equal(remainingLineDaysForCredits(new Date("2026-09-13T12:00:00Z"), now), 1);
    assert.equal(remainingLineDaysForCredits(new Date("2026-10-12T12:00:00Z"), now), 30);
  });

  it("caps far-future / unlimited expiry at one year", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    const far = new Date("2040-01-01T00:00:00Z");
    assert.equal(remainingLineDaysForCredits(far, now), 365);
  });
});

describe("extraConnectionCreditCost", () => {
  it("multiplies remaining-duration cost by extra slots", () => {
    assert.equal(extraConnectionCreditCost({ extraSlots: 2, remainingDays: 30 }), 2);
    assert.equal(extraConnectionCreditCost({ extraSlots: 1, remainingDays: 365 }), 4);
    assert.equal(extraConnectionCreditCost({ extraSlots: 3, remainingDays: 0 }), 0);
    assert.equal(extraConnectionCreditCost({ extraSlots: 0, remainingDays: 30 }), 0);
  });
});

describe("assertRoleMaySetUnlimitedConnections", () => {
  it("allows admin unlimited; blocks reseller/sub-reseller", () => {
    assert.equal(assertRoleMaySetUnlimitedConnections(PanelRole.ADMIN, 0).ok, true);
    assert.equal(assertRoleMaySetUnlimitedConnections(PanelRole.RESELLER, 0).ok, false);
    assert.equal(assertRoleMaySetUnlimitedConnections(PanelRole.SUB_RESELLER, 0).ok, false);
    const blocked = assertRoleMaySetUnlimitedConnections(PanelRole.RESELLER, 0);
    if (!blocked.ok) assert.equal(blocked.error, RESELLER_UNLIMITED_CONNECTIONS_ERROR);
    assert.equal(assertRoleMaySetUnlimitedConnections(PanelRole.RESELLER, 2).ok, true);
  });
});

describe("applyResellerCreateConnections", () => {
  it("keeps package-included connections when nothing is requested", () => {
    assert.deepEqual(
      applyResellerCreateConnections({
        role: PanelRole.RESELLER,
        includedConnections: 1,
        requested: null,
      }),
      { ok: true, maxConnections: 1, extraSlots: 0 }
    );
  });

  it("counts extras above the package default", () => {
    assert.deepEqual(
      applyResellerCreateConnections({
        role: PanelRole.RESELLER,
        includedConnections: 1,
        requested: 3,
      }),
      { ok: true, maxConnections: 3, extraSlots: 2 }
    );
  });

  it("rejects unlimited for resellers", () => {
    const r = applyResellerCreateConnections({
      role: PanelRole.RESELLER,
      includedConnections: 1,
      requested: 0,
    });
    assert.equal(r.ok, false);
  });
});
