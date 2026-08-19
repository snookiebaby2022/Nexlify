import { prisma } from "./prisma";
import { xtreamBase64, xtreamSafeText, xtreamUnix } from "./xtream-safe";

/** Parse XMLTV datetime: 20240603120000 +0000 (offset required for correct EPG times). */
export function parseXmltvDate(raw: string): Date {
  const clean = raw.trim().replace(/\s+/g, " ");
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!m) return new Date();
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10);
  const d = parseInt(m[3]!, 10);
  const h = parseInt(m[4]!, 10);
  const mi = parseInt(m[5]!, 10);
  const s = parseInt(m[6]!, 10);
  const tz = m[7];
  if (tz) {
    const sign = tz[0] === "-" ? -1 : 1;
    const tzh = parseInt(tz.slice(1, 3), 10);
    const tzm = parseInt(tz.slice(3, 5), 10);
    const offsetMin = sign * (tzh * 60 + tzm);
    const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60_000;
    return new Date(utcMs);
  }
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

function decodeXmltvText(raw: string): string {
  return raw
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseXmltvPrograms(xml: string, sourceId: string) {
  const programs: {
    sourceId: string;
    channelId: string;
    title: string;
    description: string | null;
    start: Date;
    stop: Date;
  }[] = [];

  const blockRegex = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const startM = attrs.match(/start="([^"]+)"/);
    const stopM = attrs.match(/stop="([^"]+)"/);
    const channelM = attrs.match(/channel="([^"]+)"/);
    const titleM = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descM = body.match(/<desc[^>]*>([^<]*)<\/desc>/i);
    if (!startM || !stopM || !channelM || !titleM) continue;

    programs.push({
      sourceId,
      channelId: channelM[1],
      title: decodeXmltvText(titleM[1].trim()),
      description: descM?.[1] ? decodeXmltvText(descM[1].trim()) : null,
      start: parseXmltvDate(startM[1]),
      stop: parseXmltvDate(stopM[1]),
    });
  }
  return programs;
}

export async function syncEpgSource(sourceId: string) {
  const source = await prisma.epgSource.findUnique({ where: { id: sourceId } });
  if (!source?.url) throw new Error("EPG source not found");

  let proxy = source.country
    ? await prisma.streamProxy.findFirst({
        where: { isActive: true, country: source.country },
      })
    : null;
  if (!proxy) {
    proxy = await prisma.streamProxy.findFirst({ where: { isActive: true } });
  }

  const { fetchEpgXml } = await import("./epg-fetch");
  const xml = await fetchEpgXml(source.url, proxy);
  const programs = parseXmltvPrograms(xml, sourceId);
  if (!programs.length) {
    throw new Error("EPG sync found no programmes in the guide (empty or wrong format)");
  }

  await prisma.$transaction([
    prisma.epgProgram.deleteMany({ where: { sourceId } }),
    prisma.epgProgram.createMany({ data: programs }),
    prisma.epgSource.update({
      where: { id: sourceId },
      data: { lastSync: new Date() },
    }),
  ]);

  const { invalidateEpgCache } = await import("./cache-invalidate");
  await invalidateEpgCache();

  // After a fresh guide lands, auto-link LIVE streams missing (or stale) EPG ids.
  try {
    const { autoAssignMissingEpg } = await import("./epg-auto-match");
    await autoAssignMissingEpg({ limit: 400 });
  } catch (e) {
    console.warn(
      "[epg] auto-assign after sync failed:",
      e instanceof Error ? e.message : e
    );
  }

  return programs.length;
}

export async function getShortEpg(channelId: string, limit = 4) {
  const { cacheGetOrSet } = await import("./cache");
  const { getCacheTtls } = await import("./cache-ttl");
  const ttl = await getCacheTtls();
  return cacheGetOrSet(`epg:short:${channelId}:${limit}`, ttl.epg, async () => loadShortEpg(channelId, limit));
}

async function loadShortEpg(channelId: string, limit: number) {
  const now = new Date();
  const programs = await prisma.epgProgram.findMany({
    where: {
      channelId,
      stop: { gte: now },
    },
    orderBy: { start: "asc" },
    take: limit,
  });

  return programs.map((p, i) => ({
    id: String(xtreamUnix(p.start) || i + 1),
    epg_id: xtreamSafeText(channelId),
    title: xtreamBase64(p.title),
    lang: "en",
    start: p.start.toISOString().replace("T", " ").replace(/\.\d+Z$/, ""),
    end: p.stop.toISOString().replace("T", " ").replace(/\.\d+Z$/, ""),
    description: xtreamBase64(p.description ?? ""),
    channel_id: xtreamSafeText(channelId),
    start_timestamp: String(xtreamUnix(p.start)),
    stop_timestamp: String(xtreamUnix(p.stop)),
    now_playing: i === 0 ? 1 : 0,
    has_archive: 0,
  }));
}
