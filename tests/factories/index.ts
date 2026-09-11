/**
 * Test factories / fixtures for Nexlify panel entities.
 * Persist when a test DB is configured; otherwise return build*() plain objects.
 */
import bcrypt from "bcryptjs";
import {
  PanelRole,
  StreamType,
  CategoryType,
  LineStatus,
  type PanelUser,
  type Line,
  type Bouquet,
  type Stream,
  type MagDevice,
  type EpgSource,
  type Category,
} from "@prisma/client";
import { getTestPrisma, hasTestDatabase } from "../helpers/prisma";

const BCRYPT_ROUNDS = 4;

let seq = 0;
function next(prefix: string) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export type BuiltUser = {
  username: string;
  password: string;
  passwordHash: string;
  role: PanelRole;
  credits: number;
  parentId?: string | null;
};

export async function buildAdmin(overrides: Partial<BuiltUser> = {}): Promise<BuiltUser> {
  const password = overrides.password ?? "AdminTest123!";
  return {
    username: overrides.username ?? next("admin"),
    password,
    passwordHash: overrides.passwordHash ?? (await bcrypt.hash(password, BCRYPT_ROUNDS)),
    role: PanelRole.ADMIN,
    credits: overrides.credits ?? 999999,
    parentId: null,
  };
}

export async function buildReseller(
  overrides: Partial<BuiltUser> & { parentId?: string | null } = {}
): Promise<BuiltUser> {
  const password = overrides.password ?? "ResellerTest123!";
  return {
    username: overrides.username ?? next("reseller"),
    password,
    passwordHash: overrides.passwordHash ?? (await bcrypt.hash(password, BCRYPT_ROUNDS)),
    role: PanelRole.RESELLER,
    credits: overrides.credits ?? 500,
    parentId: overrides.parentId ?? null,
  };
}

export async function buildSubReseller(
  parentId: string,
  overrides: Partial<BuiltUser> = {}
): Promise<BuiltUser> {
  const password = overrides.password ?? "SubResellerTest123!";
  return {
    username: overrides.username ?? next("subres"),
    password,
    passwordHash: overrides.passwordHash ?? (await bcrypt.hash(password, BCRYPT_ROUNDS)),
    role: PanelRole.SUB_RESELLER,
    credits: overrides.credits ?? 100,
    parentId,
  };
}

/** End-user in IPTV terms = a Line (subscriber credentials), not a PanelUser. */
export function buildEndUserLine(overrides: {
  username?: string;
  password?: string;
  ownerId?: string | null;
  maxConnections?: number;
  expiresAt?: Date;
  status?: LineStatus;
} = {}) {
  return {
    username: overrides.username ?? next("line"),
    password: overrides.password ?? "LinePass123!",
    ownerId: overrides.ownerId ?? null,
    maxConnections: overrides.maxConnections ?? 2,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 86400000),
    status: overrides.status ?? LineStatus.ACTIVE,
  };
}

export function buildBouquet(overrides: { name?: string } = {}) {
  return { name: overrides.name ?? next("bouquet"), sortOrder: 0, isActive: true };
}

export function buildLiveStream(overrides: {
  name?: string;
  streamUrl?: string;
  categoryId?: string | null;
} = {}) {
  return {
    name: overrides.name ?? next("live"),
    streamUrl: overrides.streamUrl ?? "http://127.0.0.1/mock/live.ts",
    type: StreamType.LIVE,
    categoryId: overrides.categoryId ?? null,
    isActive: true,
  };
}

export function buildSeriesEpisode(overrides: {
  name?: string;
  seriesName?: string;
  seasonNum?: number;
  episodeNum?: number;
  streamUrl?: string;
  categoryId?: string | null;
} = {}) {
  return {
    name: overrides.name ?? next("ep"),
    seriesName: overrides.seriesName ?? "Test Series",
    seasonNum: overrides.seasonNum ?? 1,
    episodeNum: overrides.episodeNum ?? 1,
    streamUrl: overrides.streamUrl ?? "http://127.0.0.1/mock/ep1.mp4",
    type: StreamType.SERIES,
    categoryId: overrides.categoryId ?? null,
    isActive: true,
    containerExtension: "mp4",
  };
}

export function buildEpgSource(overrides: { name?: string; url?: string } = {}) {
  return {
    name: overrides.name ?? next("epg"),
    url: overrides.url ?? "http://127.0.0.1/mock/epg.xml",
    sourceType: "xmltv",
    syncEveryHours: 24,
    isActive: true,
  };
}

export function buildMagDevice(lineId: string, overrides: { mac?: string; model?: string } = {}) {
  return {
    mac: overrides.mac ?? `00:1A:79:${String(seq).padStart(2, "0")}:00:01`.slice(0, 17),
    lineId,
    model: overrides.model ?? "MAG254",
    isActive: true,
  };
}

/* ---------- persist helpers (require TEST_DATABASE_URL) ---------- */

export async function createAdmin(overrides: Partial<BuiltUser> = {}): Promise<PanelUser & { password: string }> {
  const built = await buildAdmin(overrides);
  const prisma = getTestPrisma();
  const user = await prisma.panelUser.create({
    data: {
      username: built.username,
      passwordHash: built.passwordHash,
      role: built.role,
      credits: built.credits,
      isActive: true,
    },
  });
  return Object.assign(user, { password: built.password });
}

export async function createReseller(
  overrides: Partial<BuiltUser> & { parentId?: string | null } = {}
): Promise<PanelUser & { password: string }> {
  const built = await buildReseller(overrides);
  const prisma = getTestPrisma();
  const user = await prisma.panelUser.create({
    data: {
      username: built.username,
      passwordHash: built.passwordHash,
      role: built.role,
      credits: built.credits,
      parentId: built.parentId ?? undefined,
      isActive: true,
    },
  });
  return Object.assign(user, { password: built.password });
}

export async function createSubReseller(
  parentId: string,
  overrides: Partial<BuiltUser> = {}
): Promise<PanelUser & { password: string }> {
  const built = await buildSubReseller(parentId, overrides);
  const prisma = getTestPrisma();
  const user = await prisma.panelUser.create({
    data: {
      username: built.username,
      passwordHash: built.passwordHash,
      role: built.role,
      credits: built.credits,
      parentId,
      isActive: true,
    },
  });
  return Object.assign(user, { password: built.password });
}

export async function createBouquet(overrides: { name?: string } = {}): Promise<Bouquet> {
  const prisma = getTestPrisma();
  return prisma.bouquet.create({ data: buildBouquet(overrides) });
}

export async function createCategory(
  type: CategoryType = CategoryType.LIVE,
  name?: string
): Promise<Category> {
  const prisma = getTestPrisma();
  return prisma.category.create({
    data: { name: name ?? next("cat"), categoryType: type, sortOrder: 0 },
  });
}

export async function createLiveStream(
  overrides: { name?: string; streamUrl?: string; categoryId?: string | null; bouquetId?: string } = {}
): Promise<Stream> {
  const prisma = getTestPrisma();
  let categoryId = overrides.categoryId;
  if (!categoryId) {
    const cat = await createCategory(CategoryType.LIVE);
    categoryId = cat.id;
  }
  const stream = await prisma.stream.create({
    data: buildLiveStream({ ...overrides, categoryId }),
  });
  if (overrides.bouquetId) {
    await prisma.bouquetStream.create({
      data: { bouquetId: overrides.bouquetId, streamId: stream.id, sortOrder: 0 },
    });
  }
  return stream;
}

export async function createSeriesEpisode(
  overrides: {
    name?: string;
    seriesName?: string;
    seasonNum?: number;
    episodeNum?: number;
    bouquetId?: string;
  } = {}
): Promise<Stream> {
  const prisma = getTestPrisma();
  const cat = await createCategory(CategoryType.SERIES);
  const stream = await prisma.stream.create({
    data: buildSeriesEpisode({ ...overrides, categoryId: cat.id }),
  });
  if (overrides.bouquetId) {
    await prisma.bouquetStream.create({
      data: { bouquetId: overrides.bouquetId, streamId: stream.id, sortOrder: 0 },
    });
  }
  return stream;
}

export async function createEndUserLine(overrides: {
  username?: string;
  password?: string;
  ownerId?: string | null;
  bouquetIds?: string[];
  maxConnections?: number;
} = {}): Promise<Line & { passwordPlain: string }> {
  const built = buildEndUserLine(overrides);
  const prisma = getTestPrisma();
  const line = await prisma.line.create({
    data: {
      username: built.username,
      password: built.password,
      status: built.status,
      maxConnections: built.maxConnections,
      expiresAt: built.expiresAt,
      ownerId: built.ownerId ?? undefined,
      bouquets: overrides.bouquetIds?.length
        ? { create: overrides.bouquetIds.map((bouquetId) => ({ bouquetId })) }
        : undefined,
    },
  });
  return Object.assign(line, { passwordPlain: built.password });
}

export async function createEpgSource(overrides: { name?: string; url?: string } = {}): Promise<EpgSource> {
  const prisma = getTestPrisma();
  return prisma.epgSource.create({ data: buildEpgSource(overrides) });
}

function randomMac() {
  const octet = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return `00:1a:79:${octet()}:${octet()}:${octet()}`.toUpperCase();
}

export async function createMagDevice(
  lineId: string,
  overrides: { mac?: string; model?: string } = {}
): Promise<MagDevice> {
  const prisma = getTestPrisma();
  return prisma.magDevice.create({
    data: {
      ...buildMagDevice(lineId, overrides),
      mac: overrides.mac ?? randomMac(),
    },
  });
}

/** Seed a minimal connected graph for integration tests. */
export async function seedMinimalPanelGraph() {
  if (!hasTestDatabase()) {
    throw new Error("seedMinimalPanelGraph requires TEST_DATABASE_URL");
  }
  const admin = await createAdmin({ username: next("seed_admin") });
  const reseller = await createReseller({ credits: 200 });
  const sub = await createSubReseller(reseller.id, { credits: 50 });
  const bouquet = await createBouquet({ name: next("seed_bq") });
  await getTestPrisma().resellerBouquet.create({
    data: { userId: reseller.id, bouquetId: bouquet.id },
  });
  const live = await createLiveStream({ bouquetId: bouquet.id });
  const episode = await createSeriesEpisode({ bouquetId: bouquet.id, seriesName: "Seed Series" });
  const line = await createEndUserLine({
    ownerId: reseller.id,
    bouquetIds: [bouquet.id],
  });
  const mag = await createMagDevice(line.id);
  const epg = await createEpgSource();
  return { admin, reseller, sub, bouquet, live, episode, line, mag, epg };
}

export { hasTestDatabase, PanelRole, StreamType, LineStatus };
