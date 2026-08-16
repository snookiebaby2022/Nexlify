/**
 * Backfill Stream.streamIcon for MOVIE rows missing posters via TMDB.
 *
 *   cd /opt/nexlify-panel && node scripts/backfill-movie-posters.cjs
 *
 * Env: LIMIT=500 MAX_LOOPS=0 CONCURRENCY=4 DELAY_MS=120
 */
const { PrismaClient } = require("@prisma/client");

const LIMIT = Math.min(5000, Math.max(1, Number(process.env.LIMIT || 400) || 400));
const MAX_LOOPS = Math.max(0, Number(process.env.MAX_LOOPS || 0) || 0);
const CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.CONCURRENCY || 4) || 4));
const DELAY_MS = Math.max(0, Number(process.env.DELAY_MS || 120) || 120);

function cleanTitle(name) {
  return String(name || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/i, "")
    .replace(/\s*\[\d{4}\]\s*$/i, "")
    .replace(
      /\b(1080p|720p|480p|2160p|4k|uhd|hdr|hdr10|dv|dolby\s*vision|web-?dl|webrip|bluray|blu-?ray|x264|x265|h\.?264|h\.?265|hevc|aac|dts|truehd|remux|proper|repack|extended|unrated|directors?\s*cut|multi|dual\s*audio|nf|amzn|dsnp|hulu|itunes)\b/gi,
      " "
    )
    .replace(/\b(COMPLETE|PACK|BOXSET|COLLECTION)\b/gi, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadTmdbKey(prisma) {
  const row = await prisma.panelSetting.findUnique({ where: { key: "settings.tmdb" } });
  if (!row?.value) return "";
  try {
    const parsed = JSON.parse(row.value);
    return String(parsed.apiKey || "").trim();
  } catch {
    return "";
  }
}

async function searchPoster(apiKey, title) {
  const q = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=en-US&query=${q}&include_adult=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) {
    await sleep(2000);
    return searchPoster(apiKey, title);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const hit = Array.isArray(data.results) ? data.results[0] : null;
  if (!hit?.poster_path) return null;
  return {
    posterUrl: `https://image.tmdb.org/t/p/w500${hit.poster_path}`,
    tmdbId: hit.id,
    tmdbTitle: hit.title || title,
  };
}

async function mapPool(items, concurrency, fn) {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const prisma = new PrismaClient();
  const apiKey = await loadTmdbKey(prisma);
  if (!apiKey) {
    console.error("No TMDB apiKey in settings.tmdb — set Settings → TMDB first");
    process.exit(1);
  }

  let loop = 0;
  let totalUpdated = 0;
  let totalMissed = 0;
  const skipIds = new Set();

  for (;;) {
    loop++;
    if (MAX_LOOPS && loop > MAX_LOOPS) break;

    const streams = await prisma.stream.findMany({
      where: {
        type: "MOVIE",
        isActive: true,
        OR: [{ streamIcon: null }, { streamIcon: "" }],
        ...(skipIds.size
          ? { id: { notIn: [...skipIds].slice(-20000) } }
          : {}),
      },
      select: { id: true, name: true },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
    });

    if (!streams.length) {
      console.log(`Done. No movies left without posters. updated=${totalUpdated} missed=${totalMissed}`);
      break;
    }

    console.log(`loop ${loop}: scanning ${streams.length} movies…`);
    let updated = 0;
    let missed = 0;

    await mapPool(streams, CONCURRENCY, async (s) => {
      const query = cleanTitle(s.name);
      if (!query || query.length < 2) {
        missed++;
        skipIds.add(s.id);
        return;
      }
      try {
        if (DELAY_MS) await sleep(DELAY_MS);
        const hit = await searchPoster(apiKey, query);
        if (!hit?.posterUrl) {
          missed++;
          skipIds.add(s.id);
          return;
        }
        await prisma.stream.update({
          where: { id: s.id },
          data: { streamIcon: hit.posterUrl },
        });
        updated++;
      } catch (e) {
        missed++;
        // transient errors: do not skip forever
        if (missed <= 5) console.warn("fail", s.name, e instanceof Error ? e.message : e);
      }
    });

    totalUpdated += updated;
    totalMissed += missed;
    console.log(`loop ${loop}: updated=${updated} missed=${missed} totals updated=${totalUpdated} missed=${totalMissed} skipped=${skipIds.size}`);

    if (updated === 0) {
      console.log("No posters found in this batch — stopping.");
      break;
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
