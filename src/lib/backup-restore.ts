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
  errors: string[];
};

export async function restoreFullBackup(snapshot: Record<string, unknown>): Promise<BackupRestoreResult> {
  const errors: string[] = [];
  const counts: BackupRestoreResult = {
    settings: 0, bouquets: 0, categories: 0, streams: 0,
    lines: 0, users: 0, packages: 0, coupons: 0, epgSources: 0,
    errors,
  };

  // 1. Restore panel settings
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

  // 2. Restore categories (parents first, then children)
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
      const knownIds = new Set(
        (await prisma.category.findMany({ select: { id: true } })).map((c) => c.id)
      );
      for (const cat of categories) {
        if (cat.id) knownIds.add(cat.id);
      }
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
            if (parentRow) {
              parentId = rawParent;
            } else if (pass < 2) {
              continue;
            }
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
            knownIds.add(cat.id);
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

  // 3. Restore bouquets
  try {
    const bouquets = snapshot.bouquets as { id: string; name: string; sortOrder?: number; isActive?: boolean; streams?: { streamId: string }[] }[] | undefined;
    if (Array.isArray(bouquets)) {
      for (const bq of bouquets) {
        if (!bq.id || !bq.name) continue;
        const { streams: _, ...bqData } = bq;
        await prisma.bouquet.upsert({
          where: { id: bq.id },
          create: { id: bq.id, name: bq.name, sortOrder: bq.sortOrder ?? 0, isActive: bq.isActive ?? true },
          update: { name: bq.name, sortOrder: bq.sortOrder ?? 0 },
        });
        // Restore bouquet-stream links
        if (Array.isArray(bq.streams) && bq.streams.length > 0) {
          await prisma.bouquetStream.deleteMany({ where: { bouquetId: bq.id } });
          await prisma.bouquetStream.createMany({
            data: bq.streams.filter((s) => s.streamId).map((s) => ({ bouquetId: bq.id, streamId: s.streamId })),
            skipDuplicates: true,
          });
        }
        counts.bouquets++;
      }
    }
  } catch (e) {
    errors.push(`Bouquets: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. Restore streams
  try {
    const streams = snapshot.streams as Record<string, unknown>[] | undefined;
    if (Array.isArray(streams)) {
      for (const s of streams) {
        if (!s.id || !s.name) continue;
        const { id, ...data } = s;
        await prisma.stream.upsert({
          where: { id: id as string },
          create: s as any,
          update: data as any,
        });
        counts.streams++;
      }
    }
  } catch (e) {
    errors.push(`Streams: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. Restore lines (skip password if redacted)
  try {
    const lines = snapshot.lines as Record<string, unknown>[] | undefined;
    if (Array.isArray(lines)) {
      for (const l of lines) {
        if (!l.id || !l.username) continue;
        const { bouquets: lineBouquets, ...lineData } = l as any;
        // Skip lines with redacted passwords
        if (lineData.password === "[redacted-export]") {
          delete lineData.password;
        }
        await prisma.line.upsert({
          where: { id: l.id as string },
          create: l as any,
          update: lineData,
        });
        // Restore line-bouquet links
        if (Array.isArray(lineBouquets) && lineBouquets.length > 0) {
          await prisma.lineBouquet.deleteMany({ where: { lineId: l.id as string } });
          await prisma.lineBouquet.createMany({
            data: lineBouquets.map((lb: any) => ({ lineId: l.id as string, bouquetId: lb.bouquetId })).filter((lb: any) => lb.bouquetId),
            skipDuplicates: true,
          });
        }
        counts.lines++;
      }
    }
  } catch (e) {
    errors.push(`Lines: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 6. Restore users
  try {
    const users = snapshot.users as Record<string, unknown>[] | undefined;
    if (Array.isArray(users)) {
      for (const u of users) {
        if (!u.id || !u.username) continue;
        const { id, ...userData } = u as any;
        await prisma.panelUser.upsert({
          where: { id: u.id as string },
          create: u as any,
          update: userData,
        });
        counts.users++;
      }
    }
  } catch (e) {
    errors.push(`Users: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 7. Restore packages
  try {
    const packages = snapshot.packages as Record<string, unknown>[] | undefined;
    if (Array.isArray(packages)) {
      for (const p of packages) {
        if (!p.id) continue;
        await prisma.package.upsert({
          where: { id: p.id as string },
          create: p as any,
          update: p as any,
        });
        counts.packages++;
      }
    }
  } catch (e) {
    errors.push(`Packages: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 8. Restore coupons
  try {
    const coupons = snapshot.coupons as Record<string, unknown>[] | undefined;
    if (Array.isArray(coupons)) {
      for (const c of coupons) {
        if (!c.id) continue;
        await prisma.coupon.upsert({
          where: { id: c.id as string },
          create: c as any,
          update: c as any,
        });
        counts.coupons++;
      }
    }
  } catch (e) {
    errors.push(`Coupons: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 9. Restore EPG sources
  try {
    const epgSources = snapshot.epgSources as Record<string, unknown>[] | undefined;
    if (Array.isArray(epgSources)) {
      for (const e of epgSources) {
        if (!e.id) continue;
        await prisma.epgSource.upsert({
          where: { id: e.id as string },
          create: e as any,
          update: e as any,
        });
        counts.epgSources++;
      }
    }
  } catch (e) {
    errors.push(`EPG Sources: ${e instanceof Error ? e.message : String(e)}`);
  }

  await invalidateXtreamCategories();
  return counts;
}
