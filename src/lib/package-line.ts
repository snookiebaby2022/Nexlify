import { prisma } from "@/lib/prisma";
import { inferPackageDaysFromName } from "@/lib/package-days";
import { creditCostForDays, effectiveCreditCost, markedUpCreditCost } from "@/lib/package-credits";

/** Drop bouquet IDs that are no longer in the catalog (deleted bouquets leave stale Package.bouquetIds). */
export function keepExistingBouquetIds(requested: string[], existingIds: Iterable<string>): string[] {
  const keep = new Set(existingIds);
  return [...new Set(requested.map(String).filter(Boolean))].filter((id) => keep.has(id));
}

export async function filterExistingBouquetIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  if (!unique.length) return [];
  const rows = await prisma.bouquet.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  return keepExistingBouquetIds(unique, rows.map((r) => r.id));
}

export async function resolveLineCreateFromPackage(
  body: {
    packageId?: string;
    accessCode?: string;
    days?: number;
    maxConnections?: number | string | "";
    bouquetIds?: string[];
  },
  opts?: { sellerId?: string | null; honorExplicitMaxConnections?: boolean }
) {
  let days = Number(body.days ?? 30);
  const explicitDays =
    body.days != null &&
    Number.isFinite(Number(body.days)) &&
    Number(body.days) > 0
      ? Math.max(1, Math.floor(Number(body.days)))
      : null;
  const hasExplicitMax =
    body.maxConnections != null &&
    body.maxConnections !== "" &&
    Number.isFinite(Number(body.maxConnections));
  const explicitMax = hasExplicitMax ? Math.max(0, Math.floor(Number(body.maxConnections))) : null;
  let maxConnections = explicitMax ?? 1;
  const explicitBouquetIds = Array.isArray(body.bouquetIds) ? [...body.bouquetIds] : null;
  let bouquetIds: string[] = explicitBouquetIds ?? [];
  // Duration-based default so renew/create without a package still charges correctly.
  let creditCost = creditCostForDays(explicitDays ?? days);

  if (body.accessCode) {
    const code = await prisma.accessCode.findFirst({
      where: { code: String(body.accessCode).trim(), isActive: true },
    });
    if (!code) throw new Error("Invalid access code");
    if (code.expiresAt && code.expiresAt < new Date()) throw new Error("Access code expired");
    if (code.uses >= code.maxUses) throw new Error("Access code fully used");
    days = code.days;
    if (!(opts?.honorExplicitMaxConnections && explicitMax != null)) {
      maxConnections = code.maxConnections;
    }
    bouquetIds = code.bouquetIds.length ? [...code.bouquetIds] : bouquetIds;
    if (code.packageId) body.packageId = code.packageId;
    creditCost = creditCostForDays(days);
  }

  let packageProfit = 0;
  let isTrial = false;
  if (body.packageId) {
    const pkg = await prisma.package.findUnique({
      where: { id: String(body.packageId), isActive: true },
    });
    if (!pkg) throw new Error("Package not found");
    const pkgDays = inferPackageDaysFromName(pkg.name, pkg.days) ?? pkg.days;
    // Renew/custom extend sends explicit days — use those for billing even when packageId is set.
    days = explicitDays ?? pkgDays;
    if (!(opts?.honorExplicitMaxConnections && explicitMax != null)) {
      maxConnections = pkg.maxLines;
    }
    if (pkg.bouquetIds.length) bouquetIds = [...pkg.bouquetIds];
    packageProfit = pkg.profitPercent ?? 0;
    const { isIptvTrialPackageMeta } = await import("@/lib/iptv-trial-lines");
    isTrial = isIptvTrialPackageMeta({
      name: pkg.name,
      days: pkgDays,
      creditCost: pkg.creditCost,
      shopPriceCents: pkg.shopPriceCents,
    });
    creditCost = effectiveCreditCost(days, pkg.creditCost, isTrial);
  }

  // Picker / MAG-Enigma create: package fills defaults, then operator-selected IDs win.
  if (explicitBouquetIds) bouquetIds = [...explicitBouquetIds];

  // Renew/create by days alone (no package): never leave paid months at 0 for resellers.
  if (!body.packageId && !body.accessCode && !isTrial && days > 7) {
    creditCost = effectiveCreditCost(days, creditCost, false);
  }

  let sellerProfit = 0;
  if (opts?.sellerId) {
    const seller = await prisma.panelUser.findUnique({
      where: { id: opts.sellerId },
      select: { profitPercent: true, parentId: true },
    });
    sellerProfit = seller?.profitPercent ?? 0;
    if (seller?.parentId) {
      const parent = await prisma.panelUser.findUnique({
        where: { id: seller.parentId },
        select: { profitPercent: true },
      });
      sellerProfit += parent?.profitPercent ?? 0;
    }
  }

  creditCost = markedUpCreditCost(creditCost, packageProfit, sellerProfit);

  const requestedBouquets = bouquetIds;
  bouquetIds = await filterExistingBouquetIds(bouquetIds);
  if (requestedBouquets.length > 0 && bouquetIds.length === 0) {
    throw new Error(
      "This package still lists bouquets that were deleted. Open Packages, pick current bouquets, and save — then register the device again."
    );
  }

  return { days, maxConnections, bouquetIds, creditCost, accessCodeId: body.accessCode, isTrial };
}

export async function incrementAccessCodeUse(code: string) {
  await prisma.accessCode.updateMany({
    where: { code: code.trim(), isActive: true },
    data: { uses: { increment: 1 } },
  });
}
