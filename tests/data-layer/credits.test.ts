/**
 * Data-layer: credit arithmetic + transactional rollback.
 * Line delete does NOT auto-refund (blocker) — covered by an explicit assertion.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PanelRole } from "@prisma/client";
import {
  creditCostForDays,
  effectiveCreditCost,
  markedUpCreditCost,
} from "../../src/lib/package-credits.ts";
import { debitResellerCredits, sessionPaysLineCredits } from "../../src/lib/reseller-credit-charge.ts";
import {
  createReseller,
  createSubReseller,
  hasTestDatabase,
} from "../factories/index.ts";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("credit cost arithmetic (pure)", () => {
  it("create tiers: trial week free, month=1, year=4, multi-year scales", () => {
    assert.equal(creditCostForDays(1), 0);
    assert.equal(creditCostForDays(7), 0);
    assert.equal(creditCostForDays(30), 1);
    assert.equal(creditCostForDays(90), 2);
    assert.equal(creditCostForDays(180), 3);
    assert.equal(creditCostForDays(365), 4);
    assert.equal(creditCostForDays(730), 6);
    assert.equal(effectiveCreditCost(30, 0, false), 1);
    assert.equal(effectiveCreditCost(30, 5, false), 5);
    assert.equal(effectiveCreditCost(7, 99, true), 99);
  });

  it("upgrade markup compounds package + reseller percent", () => {
    assert.equal(markedUpCreditCost(1, 0, 0), 1);
    assert.equal(markedUpCreditCost(1, 100, 0), 2);
    assert.equal(markedUpCreditCost(2, 50, 50), 5); // ceil(2*1.5*1.5)=ceil(4.5)=5
  });

  it("only reseller roles pay line credits", () => {
    assert.equal(sessionPaysLineCredits(PanelRole.ADMIN), false);
    assert.equal(sessionPaysLineCredits(PanelRole.RESELLER), true);
    assert.equal(sessionPaysLineCredits(PanelRole.SUB_RESELLER), true);
    assert.equal(sessionPaysLineCredits(PanelRole.STAFF), false);
  });
});

describe("credit debit + rollback (DB)", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it(
    "create debit lowers balance and writes ledger; insufficient fails without change",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 5 });

      await prisma.$transaction(async (tx) => {
        const r = await debitResellerCredits(tx, {
          userId: reseller.id,
          amount: 2,
          note: "create line",
        });
        assert.equal(r.charged, 2);
        assert.equal(r.balanceAfter, 3);
      });

      const after = await prisma.panelUser.findUniqueOrThrow({
        where: { id: reseller.id },
        select: { credits: true },
      });
      assert.equal(after.credits, 3);
      assert.equal(
        await prisma.creditTransaction.count({
          where: { userId: reseller.id, note: "create line" },
        }),
        1
      );

      await assert.rejects(
        () =>
          prisma.$transaction((tx) =>
            debitResellerCredits(tx, {
              userId: reseller.id,
              amount: 99,
              note: "overdraw",
            })
          ),
        /Insufficient credits/
      );
      const still = await prisma.panelUser.findUniqueOrThrow({
        where: { id: reseller.id },
        select: { credits: true },
      });
      assert.equal(still.credits, 3);

      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );

  it(
    "extend/upgrade debit rolls back when later step fails",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 10 });

      await assert.rejects(
        () =>
          prisma.$transaction(async (tx) => {
            await debitResellerCredits(tx, {
              userId: reseller.id,
              amount: creditCostForDays(30),
              note: "extend +30d",
            });
            throw new Error("simulated renew failure");
          }),
        /simulated renew failure/
      );

      const row = await prisma.panelUser.findUniqueOrThrow({
        where: { id: reseller.id },
        select: { credits: true },
      });
      assert.equal(row.credits, 10);
      assert.equal(
        await prisma.creditTransaction.count({ where: { userId: reseller.id } }),
        0
      );

      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );

  it(
    "sub-reseller debit does not inherit/drain parent credits",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const parent = await createReseller({ credits: 100 });
      const sub = await createSubReseller(parent.id, { credits: 3 });

      await prisma.$transaction(async (tx) => {
        await debitResellerCredits(tx, {
          userId: sub.id,
          amount: 2,
          note: "sub create",
        });
      });

      const parentAfter = await prisma.panelUser.findUniqueOrThrow({
        where: { id: parent.id },
        select: { credits: true },
      });
      const subAfter = await prisma.panelUser.findUniqueOrThrow({
        where: { id: sub.id },
        select: { credits: true },
      });
      assert.equal(parentAfter.credits, 100);
      assert.equal(subAfter.credits, 1);

      await prisma.panelUser.delete({ where: { id: sub.id } });
      await prisma.panelUser.delete({ where: { id: parent.id } });
    }
  );

  it("delete-with-refund is not implemented on line DELETE", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/admin/lines/[id]/route.ts"),
      "utf8"
    );
    const del = src.slice(src.indexOf("export async function DELETE"));
    assert.equal(/debitResellerCredits|creditTransaction|refund|increment/.test(del), false);
  });
});
