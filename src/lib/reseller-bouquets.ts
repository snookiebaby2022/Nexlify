import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** All active bouquet IDs (sorted for stable createMany). */
export async function listActiveBouquetIds(): Promise<string[]> {
  const rows = await prisma.bouquet.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return rows.map((b) => b.id);
}

/** Bouquet IDs a parent reseller may pass to a sub-reseller. */
export async function listResellerBouquetIds(userId: string): Promise<string[]> {
  const rows = await prisma.resellerBouquet.findMany({
    where: { userId },
    select: { bouquetId: true },
  });
  return rows.map((r) => r.bouquetId);
}

/**
 * Pure selection rules for new reseller bouquet grants.
 * - Explicit ids win
 * - Admins get none
 * - Sub-resellers inherit parent set when non-empty
 * - Otherwise all active bouquets
 */
export function pickBouquetIdsForNewReseller(opts: {
  role: PanelRole;
  explicitIds: string[];
  parentIds: string[];
  allActiveIds: string[];
}): string[] {
  if (opts.explicitIds.length) return [...new Set(opts.explicitIds)];
  if (opts.role === PanelRole.ADMIN) return [];
  if (opts.role === PanelRole.SUB_RESELLER && opts.parentIds.length) {
    return opts.parentIds;
  }
  return opts.allActiveIds;
}

/**
 * Resolve which bouquets a newly created reseller / sub-reseller should receive.
 * New resellers get every active bouquet; sub-resellers inherit the parent's set
 * (or all active if the parent has none yet).
 */
export async function resolveBouquetsForNewReseller(opts: {
  role: PanelRole;
  parentId?: string | null;
  explicitIds?: string[] | null;
}): Promise<string[]> {
  const explicitIds = (opts.explicitIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (opts.role === PanelRole.ADMIN && !explicitIds.length) return [];

  const parentIds =
    opts.role === PanelRole.SUB_RESELLER && opts.parentId
      ? await listResellerBouquetIds(opts.parentId)
      : [];

  const needsAllActive =
    !explicitIds.length &&
    !(opts.role === PanelRole.SUB_RESELLER && parentIds.length) &&
    opts.role !== PanelRole.ADMIN;

  const allActiveIds = needsAllActive ? await listActiveBouquetIds() : [];

  return pickBouquetIdsForNewReseller({
    role: opts.role,
    explicitIds,
    parentIds,
    allActiveIds,
  });
}

/** Attach bouquets to a panel user (skipDuplicates). */
export async function grantBouquetsToReseller(
  userId: string,
  bouquetIds: string[]
): Promise<number> {
  if (!bouquetIds.length) return 0;
  const res = await prisma.resellerBouquet.createMany({
    data: bouquetIds.map((bouquetId) => ({ userId, bouquetId })),
    skipDuplicates: true,
  });
  return res.count;
}
