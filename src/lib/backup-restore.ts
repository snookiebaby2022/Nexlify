import { prisma } from "@/lib/prisma";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";

export type BackupRestoreResult = {
  settings: number;
  bouquets: number;
  categories: number;
  streams: number;
  lines: number;
  users: number;
  packages: number;
  coupons: number;
  epgSources: number;
  streamServers: number;
  streamProviders: number;
  magDevices: number;
  enigmaDevices: number;
  watchFolders: number;
  m3uSyncJobs: number;
  mediaIntegrations: number;
  errors: string[];
};

async function restoreSimpleRows(
  label: string,
  rows: unknown,
  errors: string[],
  upsert: (row: Record<string, unknown>) => Promise<void>
): Promise<number> {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!row.id) continue;
    try {
      await upsert(row);
      n++;
    } catch (e) {
      errors.push(`${label} ${String(row.id)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return n;
}

function stripRedactedSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  if (out.password === "[redacted-export]") delete out.password;
  if (out.passwordHash === "[redacted-export]") delete out.passwordHash;
  if (out.totpSecret === "[redacted-export]") delete out.totpSecret;
  if (out.apiKey === "[redacted-export]") delete out.apiKey;
  return out;
}

export async function restoreFullBackup(snapshot: Record<string, unknown>): Promise<BackupRestoreResult> {
  const errors: string[] = [];
  const counts: BackupRestoreResult = {
    settings: 0,
    bouquets: 0,
    categories: 0,
    streams: 0,
    lines: 0,
    users: 0,
    packages: 0,
    coupons: 0,
    epgSources: 0,
    streamServers: 0,
    streamProviders: 0,
    magDevices: 0,
    enigmaDevices: 0,
    watchFolders: 0,
    m3uSyncJobs: 0,
    mediaIntegrations: 0,
    errors,
  };

  // 1. Panel settings
  try {
    const settings = snapshot.panelSettings as { key: string; value: string }[] | undefined;
    if (Array.isArray(settings)) {
      for (const row of settings) {
        if (!row.key) continue;
        await prisma.panelSetting.upsert({
          where: { key: row.key },
          create: { key: row.key, value: row.value },
          update: { value: row.value },
        });
        counts.settings++;
      }
    }
  } catch (e) {
    errors.push(`Settings: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Categories (parents before children)
  try {
    const categories = snapshot.categories as
      | {
          id: string;
          name: string;
          parentId?: string | null;
          categoryType?: string;
          sortOrder?: number;
          isAdult?: boolean;
        }[]
      | undefined;
    if (Array.isArray(categories)) {
      const restored = new Set<string>();
      for (let pass = 0; pass < 3; pass++) {
        for (const cat of categories) {
          if (!cat.id || !cat.name) continue;
          const rawParent = cat.parentId ?? null;
          let parentId: string | null = null;
          if (rawParent) {
            const parentRow = await prisma.category.findUnique({
              where: { id: rawParent },
              select: { id: true },
            });
            if (parentRow) parentId = rawParent;
            else if (pass < 2) continue;
          }
          try {
            await prisma.category.upsert({
              where: { id: cat.id },
              create: {
                id: cat.id,
                name: cat.name,
                parentId,
                categoryType: (cat.categoryType as any) ?? "LIVE",
                sortOrder: cat.sortOrder ?? 0,
                isAdult: cat.isAdult ?? false,
              },
              update: {
                name: cat.name,
                parentId,
                categoryType: (cat.categoryType as any) ?? "LIVE",
                sortOrder: cat.sortOrder ?? 0,
                isAdult: cat.isAdult ?? false,
              },
            });
            restored.add(cat.id);
          } catch (e) {
            if (pass === 2) {
              errors.push(`Category ${cat.name}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
      counts.categories = restored.size;
    }
  } catch (e) {
    errors.push(`Categories: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Infrastructure (before streams/lines)
  await restoreSimpleRows("StreamProxy", snapshot.streamProxies, errors, async (row) => {
    await prisma.streamProxy.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });
  await restoreSimpleRows("VpnProfile", snapshot.vpnProfiles, errors, async (row) => {
    await prisma.vpnProfile.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });
  counts.streamServers = await restoreSimpleRows(
    "StreamServer",
    snapshot.streamServers,
    errors,
    async (row) => {
      await prisma.streamServer.upsert({
        where: { id: row.id as string },
        create: row as any,
        update: row as any,
      });
    }
  );
  counts.streamProviders = await restoreSimpleRows(
    "StreamProvider",
    snapshot.streamProviders,
    errors,
    async (row) => {
      await prisma.streamProvider.upsert({
        where: { id: row.id as string },
        create: row as any,
        update: row as any,
      });
    }
  );

  await restoreSimpleRows("UserGroup", snapshot.userGroups, errors, async (row) => {
    await prisma.userGroup.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.packages = await restoreSimpleRows("Package", snapshot.packages, errors, async (row) => {
    await prisma.package.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.coupons = await restoreSimpleRows("Coupon", snapshot.coupons, errors, async (row) => {
    await prisma.coupon.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.epgSources = await restoreSimpleRows("EpgSource", snapshot.epgSources, errors, async (row) => {
    await prisma.epgSource.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  // 4. Bouquets (metadata only — stream links after streams exist)
  const bouquetStreamLinks: { bouquetId: string; streamId: string }[] = [];
  try {
    const bouquets = snapshot.bouquets as
      | {
          id: string;
          name: string;
          sortOrder?: number;
          isActive?: boolean;
          streams?: { streamId: string }[];
        }[]
      | undefined;
    if (Array.isArray(bouquets)) {
      for (const bq of bouquets) {
        if (!bq.id || !bq.name) continue;
        await prisma.bouquet.upsert({
          where: { id: bq.id },
          create: {
            id: bq.id,
            name: bq.name,
            sortOrder: bq.sortOrder ?? 0,
            isActive: bq.isActive ?? true,
          },
          update: { name: bq.name, sortOrder: bq.sortOrder ?? 0 },
        });
        if (Array.isArray(bq.streams)) {
          for (const s of bq.streams) {
            if (s.streamId) bouquetStreamLinks.push({ bouquetId: bq.id, streamId: s.streamId });
          }
        }
        counts.bouquets++;
      }
    }
  } catch (e) {
    errors.push(`Bouquets: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. Streams
  counts.streams = await restoreSimpleRows("Stream", snapshot.streams, errors, async (row) => {
    const { id, ...data } = row;
    await prisma.stream.upsert({
      where: { id: id as string },
      create: row as any,
      update: data as any,
    });
  });

  // 5b. Bouquet ↔ stream links
  if (bouquetStreamLinks.length) {
    try {
      const byBouquet = new Map<string, string[]>();
      for (const link of bouquetStreamLinks) {
        const list = byBouquet.get(link.bouquetId) ?? [];
        list.push(link.streamId);
        byBouquet.set(link.bouquetId, list);
      }
      for (const [bouquetId, streamIds] of byBouquet) {
        await prisma.bouquetStream.deleteMany({ where: { bouquetId } });
        await prisma.bouquetStream.createMany({
          data: streamIds.map((streamId) => ({ bouquetId, streamId })),
          skipDuplicates: true,
        });
      }
    } catch (e) {
      errors.push(`Bouquet links: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 6. Panel users (password hashes when present in backup)
  counts.users = await restoreSimpleRows("PanelUser", snapshot.users, errors, async (row) => {
    const cleaned = stripRedactedSecrets(row);
    const { id, ...userData } = cleaned;
    await prisma.panelUser.upsert({
      where: { id: id as string },
      create: cleaned as any,
      update: userData as any,
    });
  });

  // 7. Lines + bouquet links
  try {
    const lines = snapshot.lines as Record<string, unknown>[] | undefined;
    if (Array.isArray(lines)) {
      for (const l of lines) {
        if (!l.id || !l.username) continue;
        const { bouquets: lineBouquets, ...lineData } = stripRedactedSecrets(l as Record<string, unknown>);
        await prisma.line.upsert({
          where: { id: l.id as string },
          create: l as any,
          update: lineData as any,
        });
        if (Array.isArray(lineBouquets) && lineBouquets.length > 0) {
          await prisma.lineBouquet.deleteMany({ where: { lineId: l.id as string } });
          await prisma.lineBouquet.createMany({
            data: lineBouquets
              .map((lb: any) => ({ lineId: l.id as string, bouquetId: lb.bouquetId }))
              .filter((lb: any) => lb.bouquetId),
            skipDuplicates: true,
          });
        }
        counts.lines++;
      }
    }
  } catch (e) {
    errors.push(`Lines: ${e instanceof Error ? e.message : String(e)}`);
  }

  counts.magDevices = await restoreSimpleRows("MagDevice", snapshot.magDevices, errors, async (row) => {
    await prisma.magDevice.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.enigmaDevices = await restoreSimpleRows("EnigmaDevice", snapshot.enigmaDevices, errors, async (row) => {
    await prisma.enigmaDevice.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.watchFolders = await restoreSimpleRows("WatchFolder", snapshot.watchFolders, errors, async (row) => {
    await prisma.watchFolder.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.m3uSyncJobs = await restoreSimpleRows("M3uSyncJob", snapshot.m3uSyncJobs, errors, async (row) => {
    await prisma.m3uSyncJob.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  await restoreSimpleRows("BlockedAsn", snapshot.blockedAsns, errors, async (row) => {
    await prisma.blockedAsn.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  await restoreSimpleRows("BlockedUserAgent", snapshot.blockedUserAgents, errors, async (row) => {
    await prisma.blockedUserAgent.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  await restoreSimpleRows("AccessCode", snapshot.accessCodes, errors, async (row) => {
    await prisma.accessCode.upsert({
      where: { id: row.id as string },
      create: row as any,
      update: row as any,
    });
  });

  counts.mediaIntegrations = await restoreSimpleRows(
    "MediaIntegration",
    snapshot.mediaIntegrations,
    errors,
    async (row) => {
      await prisma.mediaIntegration.upsert({
        where: { id: row.id as string },
        create: row as any,
        update: row as any,
      });
    }
  );

  await invalidateXtreamCategories();
  return counts;
}
