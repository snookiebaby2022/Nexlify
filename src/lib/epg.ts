import { prisma } from "./prisma";
import { formatXtreamEpgDateTime, normalizeTimeFormat } from "./epg-time";
import { getSettingGroup } from "./panel-settings";
import { xtreamBase64, xtreamSafeText, xtreamUnix } from "./xtream-safe";

/** Parse XMLTV datetime: 20240603120000 +0000 (offset required for correct EPG times). */
export function parseXmltvDate(raw: string): Date {
  const clean = raw.trim().replace(/\s+/g, " ");
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!m) throw new Error("Invalid XMLTV datetime: malformed timestamp");
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

function readXmlAttr(attrs: string, name: string): string | null {
  const dq = attrs.match(new RegExp(`${name}="([^"]*)"`, "i"));
  if (dq) return dq[1] ?? null;
  const sq = attrs.match(new RegExp(`${name}='([^']*)'`, "i"));
  if (sq) return sq[1] ?? null;
  return null;
}

function readXmlTagContent(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m?.[1]) return null;
  const inner = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
  return inner ? decodeXmltvText(inner) : null;
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
    const startRaw = readXmlAttr(attrs, "start");
    const stopRaw = readXmlAttr(attrs, "stop");
    const channelId = readXmlAttr(attrs, "channel");
    if (!startRaw || !stopRaw || !channelId) continue;

    let start: Date;
    let stop: Date;
    try {
      start = parseXmltvDate(startRaw);
      stop = parseXmltvDate(stopRaw);
    } catch {
      continue;
    }

    const title = readXmlTagContent(body, "title") ?? channelId;
    const description = readXmlTagContent(body, "desc");

    programs.push({
      sourceId,
      channelId,
      title,
      description,
      start,
      stop,
    });
  }
  return programs;
}

export async function syncEpgSource(
  sourceId: string,
  opts?: { skipAutoMatch?: boolean }
) {
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

  const CHUNK = 5000;
  await prisma.$transaction(
    async (tx) => {
      await tx.epgProgram.deleteMany({ where: { sourceId } });
      for (let i = 0; i < programs.length; i += CHUNK) {
        await tx.epgProgram.createMany({ data: programs.slice(i, i + CHUNK) });
      }
      await tx.epgSource.update({
        where: { id: sourceId },
        data: { lastSync: new Date(), lastSyncError: null },
      });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );

  const { invalidateEpgCache } = await import("./cache-invalidate");
  await invalidateEpgCache();

  if (!opts?.skipAutoMatch) {
    try {
      const { autoAssignMissingEpg } = await import("./epg-auto-match");
      await autoAssignMissingEpg({ limit: 400 });
    } catch (e) {
      console.warn(
        "[epg] auto-assign after sync failed:",
        e instanceof Error ? e.message : e
      );
    }
  }

  return programs.length;
}

export async function getShortEpg(
  channelId: string,
  limit = 4,
  opts?: { archivable?: boolean }
) {
  const { cacheGetOrSet } = await import("./cache");
  const { getCacheTtls } = await import("./cache-ttl");
  const general = await getSettingGroup("general");
  const timezone = String(general.timezone || "Europe/London");
  const timeFormat = normalizeTimeFormat(general.timeFormat);
  const ttl = await getCacheTtls();
  const arch = opts?.archivable ? "1" : "0";
  const cacheKey = `epg:short:${channelId}:${limit}:${timezone}:${timeFormat}:${arch}`;
  return cacheGetOrSet(cacheKey, ttl.epg, async () =>
    loadShortEpg(channelId, limit, { timezone, timeFormat, archivable: opts?.archivable })
  );
}

/** Try several XMLTV channel ids (epg_channel_id, channel_id, stream id) — XCIPTV uses numeric stream_id. */
export async function getShortEpgForChannelIds(
  channelIds: string[],
  limit = 4,
  archivable = false
) {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of channelIds) {
    const id = raw?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push(id);
  }
  if (!candidates.length) return [];

  const results = await Promise.all(
    candidates.map((id) => getShortEpg(id, limit, { archivable }))
  );
  for (const listings of results) {
    if (listings.length) return listings;
  }
  return [];
}

async function loadShortEpg(
  channelId: string,
  limit: number,
  display: { timezone: string; timeFormat: "12" | "24"; archivable?: boolean }
) {
  const now = new Date();
  const programs = await prisma.epgProgram.findMany({
    where: display.archivable
      ? {
          channelId,
          stop: { gte: new Date(now.getTime() - 7 * 86400000) },
        }
      : {
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
    start: formatXtreamEpgDateTime(p.start, display),
    end: formatXtreamEpgDateTime(p.stop, display),
    description: xtreamBase64(p.description ?? ""),
    channel_id: xtreamSafeText(channelId),
    start_timestamp: String(xtreamUnix(p.start)),
    stop_timestamp: String(xtreamUnix(p.stop)),
    now_playing: i === 0 && p.start <= now && p.stop >= now ? 1 : 0,
    has_archive: display.archivable && p.stop < now ? 1 : 0,
  }));
}
