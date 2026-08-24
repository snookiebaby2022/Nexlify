/**
 * One-shot: strip "(Plex)" from DB titles and point streamIcon at the panel artwork proxy.
 * Usage: npx tsx scripts/fix-plex-display.ts
 */
import { cleanAllPlexDisplayNames } from "../src/lib/media-integrations";
import { backfillPlexArtworkIcons } from "../src/lib/artwork-fill";

async function main() {
  console.log("Cleaning Plex display names…");
  await cleanAllPlexDisplayNames();
  console.log("Updating Plex poster proxy URLs…");
  const updated = await backfillPlexArtworkIcons();
  console.log(`Done. Poster links updated: ${updated.toLocaleString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
