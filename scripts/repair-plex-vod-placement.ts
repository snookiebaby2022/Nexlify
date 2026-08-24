import { prisma } from "../src/lib/prisma";
import { repairAllPlexVodPlacement } from "../src/lib/media-integrations";
import { rewriteStoredVodMetaForXtream, fillMissingVodInfoFromTmdb } from "../src/lib/vod-meta-rewrite";

async function main() {
  const rewritten = await rewriteStoredVodMetaForXtream();
  console.log(JSON.stringify({ rewrittenVodMeta: rewritten }, null, 2));
  const placement = await repairAllPlexVodPlacement();
  console.log(JSON.stringify({ plexPlacement: placement }, null, 2));
  if (process.env.TMDB_FILL !== "0") {
    const filled = await fillMissingVodInfoFromTmdb(Number(process.env.TMDB_FILL || 80));
    console.log(JSON.stringify({ tmdbInfoFilled: filled }, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
