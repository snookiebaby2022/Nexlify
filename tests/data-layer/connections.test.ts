/**
 * Data-layer: connection capacity + DB track/remove/prune self-heal.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  CAPACITY_STALE_MS,
  connectionCapacityAllows,
  countActiveConnectionsForLine,
  pruneStaleConnections,
  removeConnection,
} from "../../src/lib/connections.ts";
import {
  createEndUserLine,
  createLiveStream,
  createReseller,
  hasTestDatabase,
} from "../factories/index.ts";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma.ts";

describe("connection capacity (pure)", () => {
  it("increments conceptually: under max allows, at max blocks new IP", () => {
    assert.equal(connectionCapacityAllows(0, 2, 0, "10.0.0.1"), true);
    assert.equal(connectionCapacityAllows(1, 2, 0, "10.0.0.2"), true);
    assert.equal(connectionCapacityAllows(2, 2, 0, "10.0.0.3"), false);
  });

  it("same-IP zap at capacity is allowed; brand-new IP is not", () => {
    assert.equal(connectionCapacityAllows(1, 1, 1, "10.0.0.1", false), true);
    assert.equal(connectionCapacityAllows(1, 1, 0, "10.0.0.9", false), false);
  });
});

describe("connection counting (DB)", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it(
    "connect increments active count; disconnect decrements",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 1 });
      const stream = await createLiveStream();
      const line = await createEndUserLine({
        ownerId: reseller.id,
        maxConnections: 2,
      });

      assert.equal(await countActiveConnectionsForLine(line.id), 0);

      await prisma.liveConnection.create({
        data: {
          lineId: line.id,
          streamId: stream.id,
          ip: "10.1.0.1",
          lastSeenAt: new Date(),
        },
      });
      assert.equal(await countActiveConnectionsForLine(line.id), 1);

      await prisma.liveConnection.create({
        data: {
          lineId: line.id,
          streamId: stream.id,
          ip: "10.1.0.2",
          lastSeenAt: new Date(),
        },
      });
      assert.equal(await countActiveConnectionsForLine(line.id), 2);

      await removeConnection(line.id, stream.id, "10.1.0.1");
      assert.equal(await countActiveConnectionsForLine(line.id), 1);

      await prisma.line.delete({ where: { id: line.id } });
      await prisma.stream.delete({ where: { id: stream.id } }).catch(() => undefined);
      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );

  it(
    "stale/crashed rows self-heal via pruneStaleConnections",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const reseller = await createReseller({ credits: 1 });
      const stream = await createLiveStream();
      const line = await createEndUserLine({ ownerId: reseller.id });

      const staleAt = new Date(Date.now() - CAPACITY_STALE_MS - 60_000);
      await prisma.liveConnection.create({
        data: {
          lineId: line.id,
          streamId: stream.id,
          ip: "10.2.0.1",
          lastSeenAt: staleAt,
          startedAt: staleAt,
        },
      });
      await prisma.liveConnection.create({
        data: {
          lineId: line.id,
          streamId: stream.id,
          ip: "10.2.0.2",
          lastSeenAt: new Date(),
        },
      });

      // Fresh count ignores stale (PLAYBACK_STALE_MS window)
      assert.equal(await countActiveConnectionsForLine(line.id), 1);

      const pruned = await pruneStaleConnections(CAPACITY_STALE_MS);
      assert.ok(pruned.count >= 1);

      assert.equal(
        await prisma.liveConnection.count({
          where: { lineId: line.id, ip: "10.2.0.1" },
        }),
        0
      );
      assert.equal(
        await prisma.liveConnection.count({
          where: { lineId: line.id, ip: "10.2.0.2" },
        }),
        1
      );

      await prisma.line.delete({ where: { id: line.id } });
      await prisma.stream.delete({ where: { id: stream.id } }).catch(() => undefined);
      await prisma.panelUser.delete({ where: { id: reseller.id } });
    }
  );
});
