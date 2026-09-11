/**
 * Data-layer: cascade deletes leave no orphans for bouquet / line children.
 * Reseller delete with owned lines is expected to fail (Line.owner Restrict).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  createBouquet,
  createEndUserLine,
  createLiveStream,
  createMagDevice,
  createReseller,
  hasTestDatabase,
} from "../factories/index.ts";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma.ts";

describe("cascade deletes", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it(
    "deleting a bouquet removes ResellerBouquet, LineBouquet, BouquetStream",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 10 });
      const bouquet = await createBouquet();
      const stream = await createLiveStream({ bouquetId: bouquet.id });
      const line = await createEndUserLine({
        ownerId: reseller.id,
        bouquetIds: [bouquet.id],
      });
      await prisma.resellerBouquet.create({
        data: { userId: reseller.id, bouquetId: bouquet.id },
      });

      await prisma.bouquet.delete({ where: { id: bouquet.id } });

      assert.equal(
        await prisma.resellerBouquet.count({ where: { bouquetId: bouquet.id } }),
        0
      );
      assert.equal(await prisma.lineBouquet.count({ where: { bouquetId: bouquet.id } }), 0);
      assert.equal(await prisma.bouquetStream.count({ where: { bouquetId: bouquet.id } }), 0);
      // Line + stream survive (stream only loses join row)
      assert.ok(await prisma.line.findUnique({ where: { id: line.id } }));
      assert.ok(await prisma.stream.findUnique({ where: { id: stream.id } }));

      await prisma.line.delete({ where: { id: line.id } });
      await prisma.stream.delete({ where: { id: stream.id } }).catch(() => undefined);
      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );

  it(
    "deleting a line cascades MagDevice + LiveConnection + LineBouquet",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 5 });
      const bouquet = await createBouquet();
      const stream = await createLiveStream({ bouquetId: bouquet.id });
      const line = await createEndUserLine({
        ownerId: reseller.id,
        bouquetIds: [bouquet.id],
      });
      const mag = await createMagDevice(line.id);
      const conn = await prisma.liveConnection.create({
        data: {
          lineId: line.id,
          streamId: stream.id,
          ip: "10.0.0.42",
          userAgent: "data-layer-test",
          startedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });

      await prisma.line.delete({ where: { id: line.id } });

      assert.equal(await prisma.magDevice.count({ where: { id: mag.id } }), 0);
      assert.equal(await prisma.liveConnection.count({ where: { id: conn.id } }), 0);
      assert.equal(await prisma.lineBouquet.count({ where: { lineId: line.id } }), 0);

      await prisma.bouquet.delete({ where: { id: bouquet.id } });
      await prisma.stream.delete({ where: { id: stream.id } }).catch(() => undefined);
      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );

  it(
    "deleting a reseller cascades CreditTransaction + ResellerBouquet but not owned lines",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 20 });
      const bouquet = await createBouquet();
      await prisma.resellerBouquet.create({
        data: { userId: reseller.id, bouquetId: bouquet.id },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: reseller.id,
          amount: -1,
          balanceAfter: 19,
          note: "cascade-test",
        },
      });
      const line = await createEndUserLine({ ownerId: reseller.id, bouquetIds: [bouquet.id] });

      await assert.rejects(
        () => prisma.panelUser.delete({ where: { id: reseller.id } }),
        /Foreign key constraint|P2003/i
      );
      assert.ok(await prisma.line.findUnique({ where: { id: line.id } }));

      await prisma.line.delete({ where: { id: line.id } });
      await prisma.panelUser.delete({ where: { id: reseller.id } });

      assert.equal(
        await prisma.creditTransaction.count({ where: { userId: reseller.id } }),
        0
      );
      assert.equal(
        await prisma.resellerBouquet.count({ where: { userId: reseller.id } }),
        0
      );
      await prisma.bouquet.delete({ where: { id: bouquet.id } }).catch(() => undefined);
    }
  );
});
