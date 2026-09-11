/**
 * Deterministic E2E seed for Playwright.
 * Upserts fixed usernames so specs can log in without reading ephemeral factory names.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, PanelRole, LineStatus, CategoryType, StreamType } from "@prisma/client";
import { assertSafeTestDatabaseUrl, loadEnvTest } from "./env";

export const SEED_PATH = resolve(process.cwd(), "tests/e2e/.auth/seed.json");

export const E2E = {
  admin: { username: "e2e_admin", password: "E2eAdmin123!" },
  reseller: { username: "e2e_reseller", password: "E2eReseller123!", startCredits: 200 },
  resellerB: { username: "e2e_reseller_b", password: "E2eResellerB123!", startCredits: 50 },
  line: { username: "e2e_line", password: "E2eLine123!" },
  foreignLine: { username: "e2e_foreign_line", password: "E2eForeign123!" },
  packagePaid: { name: "E2E Paid 30d", creditCost: 10, days: 30 },
  packageTrial: { name: "E2E Trial 1d", creditCost: 0, days: 1 },
} as const;

export type E2eSeed = {
  adminId: string;
  resellerId: string;
  resellerBId: string;
  bouquetId: string;
  bouquetName: string;
  packagePaidId: string;
  packageTrialId: string;
  lineId: string;
  foreignLineId: string;
  streamId: string;
};

export async function seedE2eDatabase(): Promise<E2eSeed> {
  loadEnvTest(true);
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assertSafeTestDatabaseUrl(url);
  process.env.DATABASE_URL = url;

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const hash = async (password: string) => bcrypt.hash(password, 4);

  try {
    // Wipe prior E2E rows (order matters for FKs).
    const e2eUsers = await prisma.panelUser.findMany({
      where: { username: { startsWith: "e2e_" } },
      select: { id: true },
    });
    const userIds = e2eUsers.map((u) => u.id);
    if (userIds.length) {
      await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.resellerBouquet.deleteMany({ where: { userId: { in: userIds } } });
    }
    await prisma.line.deleteMany({
      where: { OR: [{ username: { startsWith: "e2e_" } }, { ownerId: { in: userIds } }] },
    });
    await prisma.panelUser.deleteMany({ where: { username: { startsWith: "e2e_" } } });
    await prisma.package.deleteMany({ where: { name: { startsWith: "E2E " } } });
    await prisma.bouquet.deleteMany({ where: { name: { startsWith: "E2E " } } });
    await prisma.stream.deleteMany({ where: { name: { startsWith: "E2E " } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: "E2E " } } });

    const admin = await prisma.panelUser.create({
      data: {
        username: E2E.admin.username,
        passwordHash: await hash(E2E.admin.password),
        role: PanelRole.ADMIN,
        credits: 999999,
        isActive: true,
      },
    });

    const reseller = await prisma.panelUser.create({
      data: {
        username: E2E.reseller.username,
        passwordHash: await hash(E2E.reseller.password),
        role: PanelRole.RESELLER,
        credits: E2E.reseller.startCredits,
        isActive: true,
      },
    });

    const resellerB = await prisma.panelUser.create({
      data: {
        username: E2E.resellerB.username,
        passwordHash: await hash(E2E.resellerB.password),
        role: PanelRole.RESELLER,
        credits: E2E.resellerB.startCredits,
        isActive: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: "E2E Live", categoryType: CategoryType.LIVE, sortOrder: 0 },
    });

    const stream = await prisma.stream.create({
      data: {
        name: "E2E Seed Live",
        streamUrl: "http://127.0.0.1/mock/e2e-live.ts",
        type: StreamType.LIVE,
        categoryId: category.id,
        isActive: true,
      },
    });

    const bouquet = await prisma.bouquet.create({
      data: {
        name: "E2E Bouquet",
        sortOrder: 0,
        isActive: true,
        streams: { create: [{ streamId: stream.id, sortOrder: 0 }] },
      },
    });

    await prisma.resellerBouquet.createMany({
      data: [
        { userId: reseller.id, bouquetId: bouquet.id },
        { userId: resellerB.id, bouquetId: bouquet.id },
      ],
    });

    const packagePaid = await prisma.package.create({
      data: {
        name: E2E.packagePaid.name,
        creditCost: E2E.packagePaid.creditCost,
        days: E2E.packagePaid.days,
        bouquetIds: [bouquet.id],
        allowResellers: true,
        isActive: true,
      },
    });

    const packageTrial = await prisma.package.create({
      data: {
        name: E2E.packageTrial.name,
        creditCost: E2E.packageTrial.creditCost,
        days: E2E.packageTrial.days,
        bouquetIds: [bouquet.id],
        allowResellers: true,
        isActive: true,
      },
    });

    const line = await prisma.line.create({
      data: {
        username: E2E.line.username,
        password: E2E.line.password,
        status: LineStatus.ACTIVE,
        maxConnections: 2,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        ownerId: reseller.id,
        packageId: packagePaid.id,
        bouquets: { create: [{ bouquetId: bouquet.id }] },
      },
    });

    const foreignLine = await prisma.line.create({
      data: {
        username: E2E.foreignLine.username,
        password: E2E.foreignLine.password,
        status: LineStatus.ACTIVE,
        maxConnections: 1,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        ownerId: resellerB.id,
        bouquets: { create: [{ bouquetId: bouquet.id }] },
      },
    });

    const seed: E2eSeed = {
      adminId: admin.id,
      resellerId: reseller.id,
      resellerBId: resellerB.id,
      bouquetId: bouquet.id,
      bouquetName: bouquet.name,
      packagePaidId: packagePaid.id,
      packageTrialId: packageTrial.id,
      lineId: line.id,
      foreignLineId: foreignLine.id,
      streamId: stream.id,
    };

    mkdirSync(dirname(SEED_PATH), { recursive: true });
    writeFileSync(SEED_PATH, JSON.stringify({ ...seed, E2E }, null, 2));
    return seed;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tests/e2e/seed.ts")) {
  seedE2eDatabase()
    .then((s) => {
      console.log("E2E seed ready:", SEED_PATH);
      console.log(JSON.stringify(s, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
