import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const conns = await p.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
  });
  console.log("live_conns", conns);

  const top = await p.$queryRaw`
    SELECT s.name, count(*)::int AS c
    FROM "LiveConnection" lc
    JOIN "Stream" s ON s.id = lc."streamId"
    WHERE lc."lastSeenAt" > now() - interval '2 minutes'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 12`;
  console.log("top_watching", JSON.stringify(top));

  const sky = await p.$queryRaw`
    SELECT s.name, left(s."streamUrl", 75) AS url
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.type = 'LIVE' AND s."isActive" = true
      AND c.name ILIKE '%UK%'
      AND s.name ILIKE '%Sky Sport%'
    ORDER BY s.name
    LIMIT 12`;
  console.log("sky_sports", JSON.stringify(sky));

  const adult = await p.$queryRaw`
    SELECT s.name, left(s."streamUrl", 75) AS url
    FROM "Stream" s
    JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.type = 'LIVE' AND s."isActive" = true
      AND (c.name ILIKE '%adult%' OR c.name ILIKE '%xxx%')
    ORDER BY s.name
    LIMIT 12`;
  console.log("adult_sample", JSON.stringify(adult));
} finally {
  await p.$disconnect();
}
