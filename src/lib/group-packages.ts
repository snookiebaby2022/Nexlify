import type { PrismaClient } from "@prisma/client";
import { creditCostForDays, STANDARD_PACKAGE_TEMPLATES } from "@/lib/package-credits";

/** Create or update standard packages and return their ids (for group assignment). */
export async function ensureStandardGroupPackages(prisma: PrismaClient): Promise<string[]> {
  const ids: string[] = [];

  for (const tpl of STANDARD_PACKAGE_TEMPLATES) {
    const existing = await prisma.package.findFirst({
      where: { days: tpl.days, name: tpl.name },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      if (existing.creditCost !== tpl.creditCost) {
        await prisma.package.update({
          where: { id: existing.id },
          data: { creditCost: tpl.creditCost },
        });
      }
      ids.push(existing.id);
      continue;
    }

    const byDays = await prisma.package.findFirst({
      where: { days: tpl.days },
      orderBy: { sortOrder: "asc" },
    });
    if (byDays) {
      await prisma.package.update({
        where: { id: byDays.id },
        data: {
          name: byDays.name || tpl.name,
          creditCost: tpl.creditCost,
        },
      });
      ids.push(byDays.id);
      continue;
    }

    const created = await prisma.package.create({
      data: {
        name: tpl.name,
        description: `Auto: ${tpl.creditCost} credit${tpl.creditCost === 1 ? "" : "s"}`,
        creditCost: tpl.creditCost,
        days: tpl.days,
        maxLines: 1,
        sortOrder: tpl.days,
        isActive: true,
      },
    });
    ids.push(created.id);
  }

  return ids;
}

/** Apply tiered credit pricing to existing package rows by days. */
export async function syncPackageCreditPricing(prisma: PrismaClient, packageIds?: string[]) {
  const where = packageIds?.length ? { id: { in: packageIds } } : {};
  const packages = await prisma.package.findMany({ where });
  for (const pkg of packages) {
    const cost = creditCostForDays(pkg.days);
    if (pkg.creditCost !== cost) {
      await prisma.package.update({
        where: { id: pkg.id },
        data: { creditCost: cost },
      });
    }
  }
}
