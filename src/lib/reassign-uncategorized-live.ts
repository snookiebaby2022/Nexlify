import type { PrismaClient } from "@prisma/client";

type CatRef = { id: string; name: string };

async function ensureLiveCategory(prisma: PrismaClient, name: string, cache: Map<string, string>) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const existing = await prisma.category.findFirst({
    where: { categoryType: "LIVE", name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.category.create({
    data: { name, categoryType: "LIVE", sortOrder: 500 },
  });
  cache.set(key, created.id);
  return created.id;
}

function findCat(cats: CatRef[], ...needles: string[]): string | null {
  for (const needle of needles) {
    const n = needle.toLowerCase();
    const hit = cats.find((c) => c.name.toLowerCase() === n || c.name.toLowerCase().includes(n));
    if (hit) return hit.id;
  }
  return null;
}

/**
 * Move streams out of LIVE "Uncategorized" into real categories by name heuristics.
 */
export async function reassignUncategorizedLiveStreams(
  prisma: PrismaClient
): Promise<{ moved: number; remaining: number; byCategory: Record<string, number> }> {
  const uncat = await prisma.category.findFirst({
    where: { name: { equals: "Uncategorized", mode: "insensitive" }, categoryType: "LIVE" },
    select: { id: true },
  });
  if (!uncat) return { moved: 0, remaining: 0, byCategory: {} };

  const cats = await prisma.category.findMany({
    where: { categoryType: "LIVE" },
    select: { id: true, name: true },
  });
  const cache = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  const abc = findCat(cats, "ABC Locals") || (await ensureLiveCategory(prisma, "ABC Locals", cache));
  const cbs = findCat(cats, "CBS Locals") || (await ensureLiveCategory(prisma, "CBS Locals", cache));
  const fox = findCat(cats, "FOX Locals") || (await ensureLiveCategory(prisma, "FOX Locals", cache));
  const nbc = findCat(cats, "NBC Locals") || (await ensureLiveCategory(prisma, "NBC Locals", cache));
  const usaSports =
    findCat(cats, "USA Sports Channels", "USA Sports") ||
    (await ensureLiveCategory(prisma, "USA Sports Channels", cache));
  const worldSport =
    findCat(cats, "World Sport Channels", "Sports Mix") ||
    (await ensureLiveCategory(prisma, "World Sport Channels", cache));
  const skySports = findCat(cats, "Sky Sports") || (await ensureLiveCategory(prisma, "Sky Sports", cache));
  const liveFootball =
    findCat(cats, "Live Football Games", "Club Friendlies") ||
    (await ensureLiveCategory(prisma, "⚽︎ Live Football Games ⚽︎", cache));
  const spanish =
    findCat(cats, "Spanish / Español", "Spanish") ||
    (await ensureLiveCategory(prisma, "Spanish / Español", cache));
  const usaEnt =
    findCat(cats, "USA Entertainment") ||
    (await ensureLiveCategory(prisma, "USA Entertainment", cache));
  const usaDoc =
    findCat(cats, "USA Documentary") || (await ensureLiveCategory(prisma, "USA Documentary", cache));
  const ukEnt =
    findCat(cats, "UK Entertainment") || (await ensureLiveCategory(prisma, "UK Entertainment", cache));
  const news =
    findCat(cats, "World News") || (await ensureLiveCategory(prisma, "World News", cache));
  const australian =
    findCat(cats, "Australian", "Australia") ||
    (await ensureLiveCategory(prisma, "Australian", cache));
  const kids =
    findCat(cats, "Kids Channels") || (await ensureLiveCategory(prisma, "Kids Channels", cache));
  const music =
    findCat(cats, "Music Channels") || (await ensureLiveCategory(prisma, "Music Channels", cache));

  const streams = await prisma.stream.findMany({
    where: { categoryId: uncat.id, type: "LIVE" },
    select: { id: true, name: true },
  });

  const byCategory: Record<string, number> = {};
  const updates = new Map<string, string[]>(); // categoryId -> streamIds

  function assign(catId: string, streamId: string, label: string) {
    if (!updates.has(catId)) updates.set(catId, []);
    updates.get(catId)!.push(streamId);
    byCategory[label] = (byCategory[label] || 0) + 1;
  }

  for (const s of streams) {
    const n = s.name.trim();

    if (/^\d{1,2}:\d{2}\s*\|/.test(n)) {
      assign(liveFootball, s.id, "Live Football");
      continue;
    }
    if (/^ESPN/i.test(n) || /\bNBA\b|\bNFL\b|\bNHL\b|\bMLB\b|\bWNBA\b/i.test(n)) {
      assign(usaSports, s.id, "USA Sports");
      continue;
    }
    if (/^beIN/i.test(n) || /^DAZN/i.test(n)) {
      assign(worldSport, s.id, "World Sport");
      continue;
    }
    if (/^SKY\s*SPORT/i.test(n)) {
      assign(skySports, s.id, "Sky Sports");
      continue;
    }
    if (/^FOX\s*SPORT/i.test(n)) {
      assign(worldSport, s.id, "World Sport");
      continue;
    }
    if (/^ABC\b/i.test(n)) {
      assign(abc, s.id, "ABC Locals");
      continue;
    }
    if (/^CBS\b/i.test(n)) {
      assign(cbs, s.id, "CBS Locals");
      continue;
    }
    if (/^FOX\b/i.test(n)) {
      assign(fox, s.id, "FOX Locals");
      continue;
    }
    if (/^NBC\b/i.test(n)) {
      assign(nbc, s.id, "NBC Locals");
      continue;
    }
    if (/TELEMUNDO|UNIVISION|LATINO:/i.test(n)) {
      assign(spanish, s.id, "Spanish");
      continue;
    }
    if (/^PBS\b|^CW\b|Peachtree CW|\bCW\d|\bMyTV\b|\bMYNET\b|^MY\s|WGN\b|WSBT|KOTA\b/i.test(n)) {
      assign(usaEnt, s.id, "USA Entertainment");
      continue;
    }
    if (/^AUS:|^NITV\b|^SBS\b|^TVSN\b|^7Mate\b|^7Two\b|^9GEM\b|^9Go|^9Life\b|^9Rush\b|^10Peach\b|Channel Nine|Ausbiz|Racing\.com|Sky Racing|EXPO Channel|Fuel TV/i.test(n)) {
      assign(australian, s.id, "Australian");
      continue;
    }
    if (/^ITV/i.test(n)) {
      assign(ukEnt, s.id, "UK Entertainment");
      continue;
    }
    if (/NEWS|Al Jazeera|CNN|MSNBC/i.test(n)) {
      assign(news, s.id, "World News");
      continue;
    }
    if (/KIDS|CARTOON|DISNEY|NICK/i.test(n)) {
      assign(kids, s.id, "Kids");
      continue;
    }
    if (/MUSIC|MTV|VH1|Juice TV/i.test(n)) {
      assign(music, s.id, "Music");
      continue;
    }
    if (/Outdoor Channel|Gusto TV|Wonder\b/i.test(n)) {
      assign(usaDoc, s.id, "USA Documentary");
      continue;
    }
  }

  let moved = 0;
  for (const [categoryId, ids] of updates) {
    const BATCH = 200;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await prisma.stream.updateMany({
        where: { id: { in: chunk } },
        data: { categoryId },
      });
      moved += res.count;
    }
  }

  const remaining = await prisma.stream.count({ where: { categoryId: uncat.id } });
  return { moved, remaining, byCategory };
}
