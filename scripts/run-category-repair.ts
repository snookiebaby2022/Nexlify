import { prisma } from "../src/lib/prisma";
import { repairBouquetCategorySplit } from "../src/lib/repair-bouquet-category-split";

async function main() {
  const result = await repairBouquetCategorySplit(prisma);
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
