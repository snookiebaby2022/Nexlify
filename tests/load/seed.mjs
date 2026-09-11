/**
 * Seed load-test fixtures against TEST_DATABASE_URL.
 *
 * Creates:
 * - load_admin / load_reseller (finite credits)
 * - bouquet with LOAD_CHANNEL_COUNT live streams (default 10_000)
 * - load_line attached to that bouquet
 * - package with creditCost=1 for double-spend races
 *
 * Writes tests/load/.fixtures.json for k6 / report scripts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnvTest, assertSafeTestDatabaseUrl } from "./env.mjs";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");
const { PrismaClient, PanelRole, LineStatus, CategoryType, StreamType } =
  require("@prisma/client");

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_PATH = resolve(__dirname, ".fixtures.json");

export const LOAD = {
  admin: { username: "load_admin", password: "LoadAdmin123!" },
  reseller: {
    username: "load_reseller",
    password: "LoadReseller123!",
    startCredits: Number(process.env.LOAD_RESELLER_CREDITS || 100),
  },
  line: { username: "load_line", password: "LoadLine123!" },
  package: { name: "Load 1cr 1d", creditCost: 1, days: 1 },
  bouquetName: "Load 10k Live",
  categoryName: "Load Live",
  streamPrefix: "Load Ch ",
};

const CHANNEL_COUNT = Math.max(
  1,
  Number(process.env.LOAD_CHANNEL_COUNT || 10_000) || 10_000
);
const BATCH = 500;

async function wipePrior(prisma) {
  const users = await prisma.panelUser.findMany({
    where: { username: { startsWith: "load_" } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.resellerBouquet.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.line.deleteMany({
    where: {
      OR: [{ username: { startsWith: "load_" } }, { ownerId: { in: userIds } }],
    },
  });
  await prisma.panelUser.deleteMany({ where: { username: { startsWith: "load_" } } });
  await prisma.package.deleteMany({ where: { name: { startsWith: "Load " } } });

  const bouquets = await prisma.bouquet.findMany({
    where: { name: { startsWith: "Load " } },
    select: { id: true },
  });
  const bouquetIds = bouquets.map((b) => b.id);
  if (bouquetIds.length) {
    await prisma.bouquetStream.deleteMany({ where: { bouquetId: { in: bouquetIds } } });
    await prisma.bouquet.deleteMany({ where: { id: { in: bouquetIds } } });
  }

  // Streams may be many — delete by name prefix in batches
  for (;;) {
    const doomed = await prisma.stream.findMany({
      where: { name: { startsWith: LOAD.streamPrefix } },
      select: { id: true },
      take: 2000,
    });
    if (!doomed.length) break;
    const ids = doomed.map((s) => s.id);
    await prisma.bouquetStream.deleteMany({ where: { streamId: { in: ids } } });
    await prisma.stream.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.category.deleteMany({ where: { name: { startsWith: "Load " } } });
}

export async function seedLoadDatabase() {
  loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assertSafeTestDatabaseUrl(url);
  process.env.DATABASE_URL = url;

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const hash = async (password) => bcrypt.hash(password, 4);

  console.log(`[load-seed] channelCount=${CHANNEL_COUNT}`);
  const t0 = Date.now();

  try {
    await wipePrior(prisma);

    const admin = await prisma.panelUser.create({
      data: {
        username: LOAD.admin.username,
        passwordHash: await hash(LOAD.admin.password),
        role: PanelRole.ADMIN,
        credits: 999999,
        isActive: true,
      },
    });

    const reseller = await prisma.panelUser.create({
      data: {
        username: LOAD.reseller.username,
        passwordHash: await hash(LOAD.reseller.password),
        role: PanelRole.RESELLER,
        credits: LOAD.reseller.startCredits,
        isActive: true,
      },
    });

    const category = await prisma.category.create({
      data: {
        name: LOAD.categoryName,
        categoryType: CategoryType.LIVE,
        sortOrder: 0,
      },
    });

    const bouquet = await prisma.bouquet.create({
      data: {
        name: LOAD.bouquetName,
        isActive: true,
      },
    });

    await prisma.resellerBouquet.create({
      data: { userId: reseller.id, bouquetId: bouquet.id },
    });

    const pkg = await prisma.package.create({
      data: {
        name: LOAD.package.name,
        creditCost: LOAD.package.creditCost,
        days: LOAD.package.days,
        bouquetIds: [bouquet.id],
        allowResellers: true,
        isActive: true,
      },
    });

    let firstStreamId = null;
    let created = 0;
    for (let offset = 0; offset < CHANNEL_COUNT; offset += BATCH) {
      const n = Math.min(BATCH, CHANNEL_COUNT - offset);
      const rows = Array.from({ length: n }, (_, i) => {
        const idx = offset + i + 1;
        return {
          name: `${LOAD.streamPrefix}${String(idx).padStart(5, "0")}`,
          streamUrl: `http://127.0.0.1:9/load/${idx}.ts`,
          type: StreamType.LIVE,
          categoryId: category.id,
          isActive: true,
          sortOrder: idx,
          channelId: `load-${idx}`,
        };
      });
      await prisma.stream.createMany({ data: rows });
      const just = await prisma.stream.findMany({
        where: {
          name: {
            in: rows.map((r) => r.name),
          },
        },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      if (!firstStreamId && just[0]) firstStreamId = just[0].id;
      await prisma.bouquetStream.createMany({
        data: just.map((s, i) => ({
          bouquetId: bouquet.id,
          streamId: s.id,
          sortOrder: offset + i + 1,
        })),
        skipDuplicates: true,
      });
      created += just.length;
      if (created % 2000 === 0 || created === CHANNEL_COUNT) {
        console.log(`[load-seed] streams ${created}/${CHANNEL_COUNT}`);
      }
    }

    const line = await prisma.line.create({
      data: {
        username: LOAD.line.username,
        password: LOAD.line.password,
        status: LineStatus.ACTIVE,
        maxConnections: 10,
        expiresAt: new Date(Date.now() + 365 * 86400_000),
        ownerId: admin.id,
        bouquets: { create: [{ bouquetId: bouquet.id }] },
      },
    });

    const fixtures = {
      seededAt: new Date().toISOString(),
      channelCount: CHANNEL_COUNT,
      adminId: admin.id,
      resellerId: reseller.id,
      resellerCredits: LOAD.reseller.startCredits,
      bouquetId: bouquet.id,
      packageId: pkg.id,
      packageCreditCost: LOAD.package.creditCost,
      lineId: line.id,
      streamId: firstStreamId,
      credentials: {
        admin: LOAD.admin,
        reseller: LOAD.reseller,
        line: LOAD.line,
      },
      elapsedMs: Date.now() - t0,
    };

    mkdirSync(dirname(FIXTURES_PATH), { recursive: true });
    writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
    console.log(`[load-seed] wrote ${FIXTURES_PATH} in ${fixtures.elapsedMs}ms`);
    return fixtures;
  } finally {
    await prisma.$disconnect();
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  seedLoadDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
