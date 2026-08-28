#!/usr/bin/env node
/**
 * Restore streams that exist in a category but do not appear in Xtream apps:
 * bouquet-linked + inactive, or playable orphans with no bouquet sibling.
 * Usage: node scripts/repair-hidden-catalog-streams.cjs [--apply]
 */
const path = require("path");
require(path.join(__dirname, "load-env.cjs")).loadEnv();
const { PrismaClient } = require("@prisma/client");

const APPLY = process.argv.includes("--apply");
const p = new PrismaClient();

const PLAYABLE = `
  s."streamUrl" IS NOT NULL
  AND s."streamUrl" NOT LIKE 'pending://%'
  AND s."streamUrl" NOT LIKE '://%'
  AND s."streamUrl" NOT LIKE 'http://:%'
  AND s."streamUrl" NOT LIKE 'https://:%'
  AND s."streamUrl" ~* '^https?://[^:]'
`;

async function main() {
  const cats247 = await p.$queryRawUnsafe(`
    SELECT c.id, c.name, c."categoryType"::text AS "categoryType",
           COUNT(s.id) FILTER (WHERE s."isActive")::int AS active_n,
           COUNT(s.id) FILTER (WHERE NOT s."isActive")::int AS inactive_n
    FROM "Category" c
    LEFT JOIN "Stream" s ON s."categoryId" = c.id
    WHERE c.name ILIKE '%24%'
    GROUP BY c.id, c.name, c."categoryType"
    ORDER BY c.name
    LIMIT 40
  `);

  const fools = await p.$queryRawUnsafe(`
    SELECT s.id, s.name, s.type::text AS type, s."isActive",
           c.name AS category,
           LEFT(s."streamUrl", 90) AS url,
           (SELECT COUNT(*) FROM "BouquetStream" bs WHERE bs."streamId" = s.id)::int AS bouquets
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.name ILIKE '%only fools%'
    ORDER BY s.name, s."isActive" DESC
    LIMIT 40
  `);

  const hiddenByCat = await p.$queryRawUnsafe(`
    SELECT COALESCE(c.name, '(uncategorized)') AS category, s.type::text AS type, COUNT(*)::int AS n
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."isActive" = false
      AND EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
    GROUP BY c.name, s.type
    ORDER BY n DESC
    LIMIT 40
  `);

  const hiddenNames = await p.$queryRawUnsafe(`
    SELECT s.name, s.type::text AS type, COALESCE(c.name, '(uncategorized)') AS category
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."isActive" = false
      AND EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
    ORDER BY category, s.name
    LIMIT 200
  `);

  const hiddenCount = await p.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n
    FROM "Stream" s
    WHERE s."isActive" = false
      AND EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
  `);

  const orphanByCat = await p.$queryRawUnsafe(`
    SELECT COALESCE(c.name, '(uncategorized)') AS category, s.type::text AS type, COUNT(*)::int AS n
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."isActive" = true
      AND NOT EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
      AND NOT EXISTS (
        SELECT 1 FROM "Stream" sib
        WHERE lower(sib.name) = lower(s.name)
          AND sib.type = s.type
          AND sib.id <> s.id
          AND EXISTS (SELECT 1 FROM "BouquetStream" b2 WHERE b2."streamId" = sib.id)
      )
    GROUP BY c.name, s.type
    ORDER BY n DESC
    LIMIT 40
  `);

  const orphanNames = await p.$queryRawUnsafe(`
    SELECT s.name, s.type::text AS type, COALESCE(c.name, '(uncategorized)') AS category
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."isActive" = true
      AND NOT EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
      AND NOT EXISTS (
        SELECT 1 FROM "Stream" sib
        WHERE lower(sib.name) = lower(s.name)
          AND sib.type = s.type
          AND sib.id <> s.id
          AND EXISTS (SELECT 1 FROM "BouquetStream" b2 WHERE b2."streamId" = sib.id)
      )
    ORDER BY c.name, s.name
    LIMIT 80
  `);

  console.log(JSON.stringify({
    apply: APPLY,
    hiddenCount: hiddenCount[0]?.n ?? 0,
    cats247,
    fools,
    hiddenByCat,
    hiddenNamesSample: hiddenNames.slice(0, 50),
    orphanByCat,
    orphanNamesSample: orphanNames.slice(0, 50),
  }, null, 2));

  if (!APPLY) {
    console.log("DRY_RUN — pass --apply to repair");
    return;
  }

  const reactivated = await p.$executeRawUnsafe(`
    UPDATE "Stream" s
    SET "isActive" = true
    WHERE s."isActive" = false
      AND EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
  `);

  const packages = await p.$queryRawUnsafe(`
    SELECT b.id, b.name
    FROM "Bouquet" b
    WHERE b."isActive" = true
      AND EXISTS (SELECT 1 FROM "LineBouquet" lb WHERE lb."bouquetId" = b.id)
    ORDER BY b."sortOrder" ASC, b.name ASC
  `);

  let linked = 0;
  const prefer = (label) => {
    const t = String(label || "").toLowerCase();
    const hit =
      packages.find((b) => t && String(b.name).toLowerCase().includes(t.slice(0, 12))) ||
      packages.find((b) => /^live tv$/i.test(b.name)) ||
      packages.find((b) => /uk no xxx/i.test(b.name)) ||
      packages[0];
    return hit?.id;
  };

  const orphans = await p.$queryRawUnsafe(`
    SELECT s.id, s."sortOrder", COALESCE(c.name, '') AS "categoryName"
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s."isActive" = true
      AND NOT EXISTS (SELECT 1 FROM "BouquetStream" bs WHERE bs."streamId" = s.id)
      AND ${PLAYABLE}
      AND NOT EXISTS (
        SELECT 1 FROM "Stream" sib
        WHERE lower(sib.name) = lower(s.name)
          AND sib.type = s.type
          AND sib.id <> s.id
          AND EXISTS (SELECT 1 FROM "BouquetStream" b2 WHERE b2."streamId" = sib.id)
      )
  `);

  const rows = [];
  for (const s of orphans) {
    const bouquetId = prefer(s.categoryName);
    if (!bouquetId) continue;
    rows.push({ bouquetId, streamId: s.id, sortOrder: s.sortOrder ?? 0 });
  }
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const created = await p.bouquetStream.createMany({ data: chunk, skipDuplicates: true });
    linked += created.count;
  }

  console.log(JSON.stringify({ reactivated, linked, orphanCandidates: orphans.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
