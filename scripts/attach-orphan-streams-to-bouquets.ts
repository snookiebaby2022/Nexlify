/**
 * Put live/movie streams that are not in any bouquet onto the matching XUI package.
 * Usage: npx tsx scripts/attach-orphan-streams-to-bouquets.ts [--apply]
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function pickBouquet(folder: string | null, name: string, bouquets: Map<string, string>): string | null {
  const text = `${folder ?? ""} ${name}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/xxx|adult/, "ADULT"],
    [/\b247\b|24\/7|24-7|xmas/, "24/7"],
    [/\bespn/, "ESPN PLUS"],
    [/\b(nba|nfl|nhl|mlb)\b/, "US SPORT (NBA,NFL,NHL,MLB)"],
    [/\bbt\s*sport/, "btsports"],
    [/irish|\bradio\b/, "IRISH AND RADIO"],
    [/\bppv\b/, "PPV"],
    [/fifa|uefa|football events|\bf1\b|moto gp/, "EVENTS (F1 drivers cam, moto gp,"],
    [/rugby|fox match|world soccer/, "EVENTS ( BR, RUGBY PASS, FOX MATCH PASS, WORLD SOCCER PASS)"],
    [/\buk\b/, "UK no XXX"],
    [/\b(us|usa)\b/, "USA"],
    [/\b(ca|canada)\b/, "CANADA"],
    [/\b(de|german|germany)\b/, "GERMAN"],
    [/\b(fr|france)\b/, "FRANCE"],
    [/\b(it|italy|\brai\b)\b/, "ITALY"],
    [/\b(es|spain|spanish)\b/, "SPANISH"],
    [/\b(pl|polish|poland)\b/, "POLISH"],
    [/\b(tr|turkey)\b/, "TURKEY"],
    [/\b(nl|dutch|netherlands)\b/, "DUTCH"],
    [/\b(pt|portugal)\b/, "portugal"],
    [/\b(bg|bulgaria)/, "BULGARIAN"],
    [/\b(ro|romania)/, "ROMANIAN"],
    [/\b(in|indian)\b/, "INDIAN"],
    [/\b(ir|iran)\b/, "IRAN"],
    [/\b(al|albania)/, "ALBANIAN"],
    [/arabic|\bar\b/, "ARABIC"],
    [/\b(au|australia)/, "AUSTRALIAN"],
    [/\b(za|africa|dstv)\b/, "AFRICA"],
    [/\b(ch|switzerland)\b/, "GERMAN"],
  ];
  for (const [re, bouquetName] of rules) {
    if (re.test(text) && bouquets.has(bouquetName)) return bouquets.get(bouquetName)!;
  }
  return null;
}

async function main() {
  const bouquetRows = await prisma.bouquet.findMany({ select: { id: true, name: true } });
  const byName = new Map(bouquetRows.map((b) => [b.name, b.id]));
  const vodId = byName.get("VOD");
  if (!vodId) throw new Error("VOD bouquet missing");

  const liveOrphans = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, bouquets: { none: {} } },
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  const movieOrphans = await prisma.stream.findMany({
    where: { type: "MOVIE", isActive: true, bouquets: { none: {} } },
    select: { id: true },
  });

  const buckets = new Map<string, string[]>();
  let unmatchedLive = 0;
  for (const s of liveOrphans) {
    const bouquetId = pickBouquet(s.category?.name ?? null, s.name, byName);
    if (!bouquetId) {
      unmatchedLive += 1;
      continue;
    }
    const list = buckets.get(bouquetId) ?? [];
    list.push(s.id);
    buckets.set(bouquetId, list);
  }

  const bbc = liveOrphans.filter((s) => /bbc one fhd/i.test(s.name));
  log(
    JSON.stringify({
      liveOrphans: liveOrphans.length,
      movieOrphans: movieOrphans.length,
      matchedLive: liveOrphans.length - unmatchedLive,
      unmatchedLive,
      bbcOneFhd: bbc.map((s) => ({
        name: s.name,
        folder: s.category?.name ?? null,
        bouquet: pickBouquet(s.category?.name ?? null, s.name, byName),
      })),
      byBouquet: [...buckets.entries()].map(([id, ids]) => ({
        bouquet: bouquetRows.find((b) => b.id === id)?.name,
        n: ids.length,
      })),
    })
  );

  if (!APPLY) {
    log("dry-run. Re-run with --apply");
    return;
  }

  let linked = 0;
  for (const [bouquetId, ids] of buckets) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await prisma.bouquetStream.createMany({
        data: chunk.map((streamId, idx) => ({ bouquetId, streamId, sortOrder: 50_000 + i + idx })),
        skipDuplicates: true,
      });
      linked += res.count;
    }
  }
  if (movieOrphans.length) {
    for (let i = 0; i < movieOrphans.length; i += BATCH) {
      const chunk = movieOrphans.slice(i, i + BATCH);
      const res = await prisma.bouquetStream.createMany({
        data: chunk.map((s, idx) => ({ bouquetId: vodId, streamId: s.id, sortOrder: 80_000 + i + idx })),
        skipDuplicates: true,
      });
      linked += res.count;
    }
  }
  log(JSON.stringify({ linked, unmatchedLiveLeft: unmatchedLive }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
