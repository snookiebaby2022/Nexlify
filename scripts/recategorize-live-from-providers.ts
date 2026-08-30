import { prisma } from "../src/lib/prisma";
import { recategorizeLiveFromProviders } from "../src/lib/recategorize-from-provider";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next.trim();
}

async function main() {
  const providerId = argValue("--provider-id");
  if (!providerId) {
    console.error("Refusing to run. Pass --provider-id <id>. Matching every provider at once is disabled.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const dryRun = !apply || process.argv.includes("--dry-run");
  const overwriteExisting = process.argv.includes("--overwrite");

  if (!dryRun && !apply) {
    console.error("Refusing to write. Pass --apply after a dry run.");
    process.exit(1);
  }

  const result = await recategorizeLiveFromProviders({
    providerId,
    dryRun,
    overwriteExisting,
    sampleLimit: 40,
  });
  console.log(
    JSON.stringify(
      {
        dryRun,
        overwriteExisting,
        providerId,
        providers: result.providers,
        remoteStreams: result.remoteStreams,
        matched: result.matched,
        updated: result.updated,
        unchanged: result.unchanged,
        unmatched: result.unmatched,
        skippedOtherProvider: result.skippedOtherProvider,
        skippedExisting: result.skippedExisting,
        createdCategories: result.createdCategories,
        samples: result.samples,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
