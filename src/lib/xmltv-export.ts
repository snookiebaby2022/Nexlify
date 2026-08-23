import { prisma } from "@/lib/prisma";
import { activeBouquetIds, bouquetMembershipSql, type LineWithBouquets } from "@/lib/lines";
import { StreamType, Prisma } from "@prisma/client";
import { formatXmltvDateForXtreamApps } from "@/lib/epg-time";
import { xmltvChannelIds } from "@/lib/xmltv-http";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";
import { gzip, gunzipSync } from "zlib";
import { promisify } from "util";
import { cacheGet, cacheSet } from "@/lib/cache";

const gzipAsync = promisify(gzip);

const PROGRAMS_PER_CHANNEL = 16;
const DESC_MAX_CHARS = 160;
const EPG_ID_CHUNK = 1500;
const XMLTV_CACHE_TTL_SEC = 600;

function truncateXmltvDesc(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= DESC_MAX_CHARS) return text;
  return `${text.slice(0, DESC_MAX_CHARS - 1).trimEnd()}…`;
}

/** Gzipped XMLTV — cached as base64 so HTTP gzip is not built twice in RAM. */
export async function buildLineXmltvGzip(line: LineWithBouquets, hoursAhead?: number): Promise<Buffer> {
  const hours = hoursAhead && hoursAhead > 0 ? hoursAhead : 24;
  const key = `xmltv:gz:v15:${line.id}:${hours}`;
  const hit = await cacheGet<string>(key);
  if (typeof hit === "string" && hit.length > 8) {
    try {
      return Buffer.from(hit, "base64");
    } catch {
      /* rebuild */
    }
  }
  const xml = await buildLineXmltvBody(line, hours);
  const gz = await gzipAsync(Buffer.from(xml, "utf8"), { level: 3 });
  await cacheSet(key, gz.toString("base64"), XMLTV_CACHE_TTL_SEC);
  return gz;
}

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead?: number): Promise<string> {
  return gunzipSync(await buildLineXmltvGzip(line, hoursAhead)).toString("utf8");
}

/**
 * Background xmltv cache fill. Do not call from get_live_streams / catalog
 * actions — a 10s+ build on the IPTV worker stalls Update Content and the
 * first zap. Cached xmltv.php (~300ms) is enough for XCIPTV Reload EPG.
 */
export function warmLineXmltv(line: LineWithBouquets): void {
  void buildLineXmltvGzip(line).catch((err) => {
    console.error("[xmltv] warm failed:", err instanceof Error ? err.message : err);
  });
}

type LineChannel = {
  stream_cuid: string;
  epg_id: string;
  stream_channel_id: string | null;
  name: string;
};

type ProgramRow = {
  channelId: string;
  title: string;
  description: string | null;
  start: Date;
  stop: Date;
};

async function loadProgramsForEpgIds(
  epgIds: string[],
  now: Date,
  until: Date
): Promise<ProgramRow[]> {
  const out: ProgramRow[] = [];
  for (let i = 0; i < epgIds.length; i += EPG_ID_CHUNK) {
    const chunk = epgIds.slice(i, i + EPG_ID_CHUNK);
    if (!chunk.length) continue;
    try {
      const rows = await prisma.$queryRaw<ProgramRow[]>`
        SELECT x."channelId", x.title, x.description, x.start, x.stop
        FROM (
          SELECT
            e."channelId",
            e.title,
            e.description,
            e.start,
            e.stop,
            ROW_NUMBER() OVER (PARTITION BY e."channelId" ORDER BY e.start ASC) AS rn
          FROM "EpgProgram" e
          WHERE e."channelId" IN (${Prisma.join(chunk)})
            AND e.stop >= ${now}
            AND e.start <= ${until}
        ) x
        WHERE x.rn <= ${PROGRAMS_PER_CHANNEL}
      `;
      out.push(...rows);
    } catch (err) {
      console.error("[xmltv] program chunk failed:", err instanceof Error ? err.message : err);
    }
  }
  return out;
}

async function buildLineXmltvBody(line: LineWithBouquets, hoursAhead: number): Promise<string> {
  const general = await getSettingGroup("general");
  const streams = await getSettingGroup("streams");
  const panelTimezone = String(general.timezone || "Europe/London");
  const hours = hoursAhead > 0 ? hoursAhead : Number(streams.epgHoursAhead) || 24;
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600_000);

  const bouquetIds = activeBouquetIds(line);
  const channels = bouquetIds.length
    ? await prisma.$queryRaw<LineChannel[]>`
    SELECT
      s.id AS stream_cuid,
      COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id) AS epg_id,
      NULLIF(TRIM(s."channelId"), '') AS stream_channel_id,
      s.name
    FROM ${bouquetMembershipSql(bouquetIds)} m
    INNER JOIN "Stream" s ON s.id = m."streamId"
    WHERE s.type = ${StreamType.LIVE}::"StreamType"
      AND s."isActive" = true
    ORDER BY s.name, s.id
  `
    : [];

  const epgIdSet = new Set<string>();
  for (const c of channels) {
    const epgId = c.epg_id?.trim();
    if (epgId) {
      epgIdSet.add(epgId);
      epgIdSet.add(epgId.toLowerCase());
    }
    const extra = c.stream_channel_id?.trim();
    if (extra) {
      epgIdSet.add(extra);
      epgIdSet.add(extra.toLowerCase());
    }
  }

  const programs = epgIdSet.size
    ? await loadProgramsForEpgIds([...epgIdSet], now, until)
    : [];

  const programsByChannel = new Map<string, ProgramRow[]>();
  for (const p of programs) {
    for (const key of new Set([p.channelId, p.channelId.toLowerCase()])) {
      const list = programsByChannel.get(key) ?? [];
      list.push(p);
      programsByChannel.set(key, list);
    }
  }

  const channelMap = new Map<string, string>();
  const programSeen = new Set<string>();
  const programRows: ProgramRow[] = [];

  const pushProgrammes = (ids: string[], listings: ProgramRow[]) => {
    for (const p of listings) {
      for (const channelId of ids) {
        const key = `${channelId}|${p.start.toISOString()}|${p.title}`;
        if (programSeen.has(key)) continue;
        programSeen.add(key);
        programRows.push({
          channelId,
          title: p.title,
          description: truncateXmltvDesc(p.description),
          start: p.start,
          stop: p.stop,
        });
      }
    }
  };

  for (const row of channels) {
    const epgId = String(row.epg_id || "").trim();
    if (!epgId) continue;
    const extra = row.stream_channel_id?.trim();
    const catalogIds = xmltvChannelIds(epgId, row.stream_cuid, extra);
    const listings = [
      ...(programsByChannel.get(epgId) ?? []),
      ...(epgId !== epgId.toLowerCase() ? programsByChannel.get(epgId.toLowerCase()) ?? [] : []),
      ...(extra ? programsByChannel.get(extra) ?? [] : []),
      ...(extra && extra !== extra.toLowerCase() ? programsByChannel.get(extra.toLowerCase()) ?? [] : []),
    ];
    const uniqueListings: ProgramRow[] = [];
    const seenListing = new Set<string>();
    for (const p of listings) {
      const k = `${p.start.toISOString()}|${p.title}`;
      if (seenListing.has(k)) continue;
      seenListing.add(k);
      uniqueListings.push(p);
    }
    if (!uniqueListings.length) continue;
    for (const id of catalogIds) {
      if (!channelMap.has(id)) channelMap.set(id, row.name || "Live");
    }
    pushProgrammes(catalogIds, uniqueListings);
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    '<tv generator-info-name="Xtream Codes" generator-info-url="">',
  ];
  for (const [id, name] of channelMap) {
    lines.push(
      `  <channel id="${xmltvSafeText(id)}"><display-name>${xmltvSafeText(name) || "Live"}</display-name></channel>`
    );
  }
  for (const p of programRows) {
    const ch = xmltvSafeText(p.channelId);
    if (!ch) continue;
    lines.push(
      `  <programme start="${formatXmltvDateForXtreamApps(p.start, panelTimezone)}" stop="${formatXmltvDateForXtreamApps(p.stop, panelTimezone)}" channel="${ch}">`,
      `    <title lang="en">${xmltvSafeText(p.title) || "Programme"}</title>`
    );
    if (p.description) lines.push(`    <desc lang="en">${xmltvSafeText(p.description)}</desc>`);
    lines.push("  </programme>");
  }
  lines.push("</tv>");
  return lines.join("\n");
}
