import { prisma } from "@/lib/prisma";
import { inferPackageDaysFromName } from "@/lib/package-days";
import { creditCostForDays, effectiveCreditCost, markedUpCreditCost } from "@/lib/package-credits";

export async function resolveLineCreateFromPackage(
  body: {
    packageId?: string;
    accessCode?: string;
    days?: number;
    maxConnections?: number;
    bouquetIds?: string[];
  },
  opts?: { sellerId?: string | null }
) {
  let days = Number(body.days ?? 30);
  const explicitDays =
    body.days != null &&
    Number.isFinite(Number(body.days)) &&
    Number(body.days) > 0
      ? Math.max(1, Math.floor(Number(body.days)))
      : null;
  let maxConnections = Number(body.maxConnections ?? 1);
  let bouquetIds: string[] = body.bouquetIds ?? [];
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
    maxConnections = code.maxConnections;
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
    maxConnections = pkg.maxLines;
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

  return { days, maxConnections, bouquetIds, creditCost, accessCodeId: body.accessCode, isTrial };
}

export async function incrementAccessCodeUse(code: string) {
  await prisma.accessCode.updateMany({
    where: { code: code.trim(), isActive: true },
    data: { uses: { increment: 1 } },
  });
}
