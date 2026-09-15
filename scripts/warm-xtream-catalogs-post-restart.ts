/**
 * Warm Xtream catalog gzip blobs after panel restart (same logic as cron jobWarmXtreamCatalogs).
 */
import { PrismaClient } from "@prisma/client";
import { excludeDisabledFromExport } from "../src/lib/export-policy";
import { lineBouquetCacheToken } from "../src/lib/lines";
import { warmXtreamCatalogsNow } from "../src/lib/xtream-catalog-blob";

const MAX_TOKENS = Math.min(32, Math.max(1, Number(process.env.NEXLIFY_WARM_MAX_TOKENS) || 16));

async function main() {
  const prisma = new PrismaClient();
  try {
    const excludeDisabled = await excludeDisabledFromExport();
    const lines = await prisma.line.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { bouquets: { include: { bouquet: true } } },
      take: 120,
      orderBy: { updatedAt: "desc" },
    });
    const seen = new Set<string>();
    let warmed = 0;
    for (const line of lines) {
      const token = lineBouquetCacheToken(line, excludeDisabled);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      await warmXtreamCatalogsNow(line);
      warmed += 1;
      if (seen.size >= MAX_TOKENS) break;
    }
    if (!seen.size) {
      console.log("[warm-xtream] no active lines with bouquets — skip");
      return;
    }
    console.log(`[warm-xtream] warmed ${warmed} bouquet token(s) via catalog builder`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((e) => {
  console.warn("[warm-xtream] failed (non-fatal):", e instanceof Error ? e.message : e);
  process.exit(0);
});
