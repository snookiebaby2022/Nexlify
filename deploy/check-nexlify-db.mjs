import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const p = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: "file:/var/www/nexlify/data/nexlify.db" }),
});
const plans = await p.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
const addons = await p.addonProduct.findMany({ orderBy: { sortOrder: "asc" } });
console.log(
  JSON.stringify(
    {
      plans: plans.map((x) => ({ whmcsProductId: x.whmcsProductId, name: x.name, slug: x.slug })),
      addons: addons.map((x) => ({ whmcsProductId: x.whmcsProductId, name: x.name, service: x.service })),
    },
    null,
    2,
  ),
);
await p.$disconnect();
