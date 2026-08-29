#!/usr/bin/env node
/** CLI: purge UK/USA URL duplicate live streams + optional full live URL dedupe. */
const path = require("path");
process.chdir(path.join(__dirname, ".."));

async function main() {
  require("tsx/cjs");
  const { purgeUkUsaUrlDuplicateLive, findDuplicateGroups, deleteDuplicateStreams } = await import(
    "../src/lib/stream-duplicates.ts"
  );
  const { invalidatePlaybackUrls, invalidateXtreamCategories, invalidateDashboardStats } = await import(
    "../src/lib/cache-invalidate.ts"
  );

  console.log("Purging UK/USA URL duplicates…");
  const uk = await purgeUkUsaUrlDuplicateLive();
  console.log("UK/USA purge:", uk);

  if (process.argv.includes("--all-live-url")) {
    console.log("Scanning all live URL duplicates…");
    let deleted = 0;
    let offset = 0;
    const limit = 50;
    for (let page = 0; page < 500; page++) {
      const { groups, totalGroups } = await findDuplicateGroups("live", {
        match: "url",
        limit,
        offset,
      });
      if (!groups.length) break;
      const ids = [];
      for (const g of groups) {
        for (const m of g.members) {
          if (m.id !== g.keepId) ids.push(m.id);
        }
      }
      if (ids.length) {
        const r = await deleteDuplicateStreams(ids);
        deleted += r.deleted;
        console.log(`  page ${page + 1}: deleted ${r.deleted}`);
      }
      offset += limit;
      if (offset >= (totalGroups ?? 0)) break;
    }
    console.log("All live URL dedupe deleted:", deleted);
  }

  await invalidatePlaybackUrls();
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
