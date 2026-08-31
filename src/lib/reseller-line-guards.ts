import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUnlimitedLineExpiry } from "@/lib/format";
import { isUnlimitedDurationDays } from "@/lib/line-duration-presets";

export const RESELLER_BOUQUET_ACCESS_ERROR =
  "No bouquets are assigned to your reseller account. Ask your administrator to grant bouquet access under Admin → Resellers → Bouquet Access.";

export const RESELLER_UNLIMITED_LINE_ERROR =
  "Only administrators can create or set unlimited lines";

/** Resellers and sub-resellers cannot mint far-future / unlimited expiry. */
export function assertRoleMaySetUnlimited(
  role: PanelRole,
  opts: { unlimited?: boolean; days?: number; expiresAt?: Date | null }
): { ok: true } | { ok: false; error: string } {
  if (role === PanelRole.ADMIN) return { ok: true };
  if (opts.unlimited === true) {
    return { ok: false, error: RESELLER_UNLIMITED_LINE_ERROR };
  }
  if (opts.days != null && isUnlimitedDurationDays(opts.days)) {
    return { ok: false, error: RESELLER_UNLIMITED_LINE_ERROR };
  }
  if (opts.expiresAt && isUnlimitedLineExpiry(opts.expiresAt)) {
    return { ok: false, error: RESELLER_UNLIMITED_LINE_ERROR };
  }
  return { ok: true };
}

/** Intersect requested bouquet IDs with reseller allowance; default to all allowed when none match. */
export function pickResellerLineBouquetIds(allowed: string[], requested: string[]): string[] {
  const allowedSet = new Set(allowed);
  const req = [...new Set(requested.map(String).filter(Boolean))];
  const matched = req.filter((id) => allowedSet.has(id));
  return matched.length ? matched : [...allowed];
}

/**
 * Packages and access codes often list every admin bouquet. Intersect with the
 * reseller's granted set; if none match, default to all allowed bouquets.
 */
export async function resolveResellerLineBouquets(
  userId: string,
  role: PanelRole,
  bouquetIds: string[]
): Promise<{ ok: true; bouquetIds: string[] } | { ok: false; error: string }> {
  if (role === PanelRole.ADMIN) {
    return { ok: true, bouquetIds: [...new Set(bouquetIds.filter(Boolean))] };
  }

  const rows = await prisma.resellerBouquet.findMany({
    where: { userId },
    select: { bouquetId: true },
  });
  const allowed = rows.map((r) => r.bouquetId);
  if (!allowed.length) {
    return { ok: false, error: RESELLER_BOUQUET_ACCESS_ERROR };
  }

  return { ok: true, bouquetIds: pickResellerLineBouquetIds(allowed, bouquetIds) };
}

export async function assertResellerCanCreateLine(
  session: { id: string; role: PanelRole },
  bouquetIds: string[]
): Promise<{ ok: true; bouquetIds: string[] } | { ok: false; error: string }> {
  if (session.role === PanelRole.ADMIN) {
    return { ok: true, bouquetIds };
  }

  const owner = await prisma.panelUser.findUnique({
    where: { id: session.id },
    select: {
      credits: true,
      maxLines: true,
      _count: { select: { lines: true } },
    },
  });
  if (!owner) return { ok: false, error: "Forbidden" };

  if (owner.maxLines > 0 && owner._count.lines >= owner.maxLines) {
    return {
      ok: false,
      error: `Line limit reached (${owner.maxLines} max). Contact your upline for more capacity.`,
    };
  }

  const bouquets = await resolveResellerLineBouquets(session.id, session.role, bouquetIds);
  if (!bouquets.ok) return bouquets;
  if (!bouquets.bouquetIds.length) {
    return { ok: false, error: RESELLER_BOUQUET_ACCESS_ERROR };
  }

  return { ok: true, bouquetIds: bouquets.bouquetIds };
}
