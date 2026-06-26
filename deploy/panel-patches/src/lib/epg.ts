import { prisma } from "./prisma";

/** Parse XMLTV datetime: 20240603120000 +0000 */
export function parseXmltvDate(raw: string): Date {
  const clean = raw.trim().replace(/\s+/g, "");
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date();
  return new Date(
    Date.UTC(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      parseInt(m[6], 10)
    )
  );
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
      title: titleM[1].trim(),
      description: descM?.[1]?.trim() ?? null,
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

  const { cacheDel } = await import("./cache");
  await cacheDel("epg");

  return programs.length;
}

export async function getShortEpg(channelId: string, limit = 4) {
  const { cacheGetOrSet } = await import("./cache");
  return cacheGetOrSet(`epg:short:${channelId}:${limit}`, 120, async () => loadShortEpg(channelId, limit));
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
    id: p.id,
    epg_id: channelId,
    title: p.title,
    lang: "en",
    start: p.start.toISOString(),
    end: p.stop.toISOString(),
    description: p.description ?? "",
    channel_id: channelId,
    start_timestamp: Math.floor(p.start.getTime() / 1000),
    stop_timestamp: Math.floor(p.stop.getTime() / 1000),
    now_playing: i === 0 ? 1 : 0,
    has_archive: 0,
  }));
}
