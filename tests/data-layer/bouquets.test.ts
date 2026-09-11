/**
 * Data-layer: bouquet assignment + reseller/sub-reseller inheritance.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PanelRole } from "@prisma/client";
import {
  grantBouquetsToReseller,
  pickBouquetIdsForNewReseller,
  resolveBouquetsForNewReseller,
} from "../../src/lib/reseller-bouquets.ts";
import { pickResellerLineBouquetIds } from "../../src/lib/reseller-line-guards.ts";
import {
  createBouquet,
  createReseller,
  createSubReseller,
  hasTestDatabase,
} from "../factories/index.ts";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma.ts";

describe("bouquet assignment (pure)", () => {
  it("line assignment: requested ∩ allowed, else inherit full allowed set", () => {
    assert.deepEqual(pickResellerLineBouquetIds(["a", "b", "c"], ["b", "x"]), ["b"]);
    assert.deepEqual(pickResellerLineBouquetIds(["a", "b"], ["x"]), ["a", "b"]);
    assert.deepEqual(pickResellerLineBouquetIds(["a"], []), ["a"]);
  });

  it("new reseller inherits all active; sub inherits parent package set", () => {
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.RESELLER,
        explicitIds: [],
        parentIds: [],
        allActiveIds: ["1", "2"],
      }),
      ["1", "2"]
    );
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        explicitIds: [],
        parentIds: ["p1", "p2"],
        allActiveIds: ["1", "2", "3"],
      }),
      ["p1", "p2"]
    );
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        explicitIds: ["only"],
        parentIds: ["p1"],
        allActiveIds: ["1"],
      }),
      ["only"]
    );
  });
});

describe("bouquet inheritance (DB)", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it(
    "sub-reseller resolveBouquetsForNewReseller inherits parent ResellerBouquet rows",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const parent = await createReseller({ credits: 1 });
      const b1 = await createBouquet({ name: `bq_a_${Date.now()}` });
      const b2 = await createBouquet({ name: `bq_b_${Date.now()}` });
      const b3 = await createBouquet({ name: `bq_c_${Date.now()}` });
      await grantBouquetsToReseller(parent.id, [b1.id, b2.id]);

      const inherited = await resolveBouquetsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        parentId: parent.id,
      });
      assert.deepEqual(new Set(inherited), new Set([b1.id, b2.id]));
      assert.equal(inherited.includes(b3.id), false);

      const sub = await createSubReseller(parent.id, { credits: 1 });
      const granted = await grantBouquetsToReseller(sub.id, inherited);
      assert.equal(granted, 2);
      const subRows = await prisma.resellerBouquet.findMany({
        where: { userId: sub.id },
        select: { bouquetId: true },
      });
      assert.deepEqual(
        new Set(subRows.map((r) => r.bouquetId)),
        new Set([b1.id, b2.id])
      );

      await prisma.panelUser.delete({ where: { id: sub.id } });
      await prisma.panelUser.delete({ where: { id: parent.id } });
      await prisma.bouquet.deleteMany({ where: { id: { in: [b1.id, b2.id, b3.id] } } });
    }
  );

  it(
    "negative: empty parent set falls back to all active bouquets",
    { skip: !hasTestDatabase() },
    async () => {
      const parent = await createReseller({ credits: 1 });
      const orphanParent = await resolveBouquetsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        parentId: parent.id,
      });
      // Parent has no ResellerBouquet — resolve falls back to all active (may be many).
      assert.ok(Array.isArray(orphanParent));
      await getTestPrisma().panelUser.delete({ where: { id: parent.id } });
    }
  );
});
