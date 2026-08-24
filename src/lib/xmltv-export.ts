import { prisma } from "@/lib/prisma";
import { activeBouquetIds, bouquetMembershipSql, lineBouquetCacheToken, type LineWithBouquets } from "@/lib/lines";
import { StreamType, Prisma } from "@prisma/client";
import { formatXmltvDateForXtreamApps } from "@/lib/epg-time";
import { xmltvChannelIds } from "@/lib/xmltv-http";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";
import { gunzipSync } from "zlib";
import {
  catalogBlobPath,
  catalogFileAgeMs,
  catalogFileIsFresh,
  catalogFileIsUsable,
  CATALOG_BLOB_VERSION,
  hashCatalogKey,
  withCatalogBuildLock,
  writeGzipTextFile,
} from "@/lib/catalog-disk-cache";
import { yieldEventLoop } from "@/lib/yield-event-loop";
import { readFile } from "node:fs/promises";

const PROGRAMS_PER_CHANNEL = 16;
const DESC_MAX_CHARS = 160;
const EPG_ID_CHUNK = 1500;
const CHANNEL_WRITE_BATCH = 400;

function truncateXmltvDesc(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= DESC_MAX_CHARS) return text;
  return `${text.slice(0, DESC_MAX_CHARS - 1).trimEnd()}…`;
}

function xmltvBlobName(line: LineWithBouquets, hours: number): string {
  const key = hashCatalogKey([CATALOG_BLOB_VERSION, "xmltv", lineBouquetCacheToken(line), String(hours)]);
  return `xmltv-${key}.xml.gz`;
}

async function ensureLineXmltvGzipFile(line: LineWithBouquets, hours: number): Promise<string> {
  const destPath = catalogBlobPath(xmltvBlobName(line, hours));
  const age = await catalogFileAgeMs(destPath);
  const rebuild = async () => {
    await withCatalogBuildLock(destPath, async () => {
      await writeLineXmltvGzipFile(line, hours, destPath);
      return "built" as const;
    });
  };
  if (catalogFileIsFresh(age)) return destPath;
  if (catalogFileIsUsable(age)) {
    void rebuild().catch((err) => {
      console.error("[xmltv] background rebuild failed:", err instanceof Error ? err.message : err);
    });
    return destPath;
  }
  await rebuild();
  return destPath;
}

/** Path to bouquet-keyed gzip XMLTV — stream this from xmltv.php, do not buffer. */
export async function resolveLineXmltvGzipPath(line: LineWithBouquets, hoursAhead?: number): Promise<string> {
  const hours = hoursAhead && hoursAhead > 0 ? hoursAhead : 24;
  return ensureLineXmltvGzipFile(line, hours);
}

/** Gzipped XMLTV buffer (tests / small callers). Prefer resolveLineXmltvGzipPath on the HTTP path. */
export async function buildLineXmltvGzip(line: LineWithBouquets, hoursAhead?: number): Promise<Buffer> {
  const filePath = await resolveLineXmltvGzipPath(line, hoursAhead);
  return readFile(filePath);
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
  void resolveLineXmltvGzipPath(line).catch((err) => {
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

async function writeLineXmltvGzipFile(line: LineWithBouquets, hoursAhead: number, destPath: string): Promise<void> {
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

  const channelLines: string[] = [];
  const programSeen = new Set<string>();
  const programmeParts: string[] = [];

  const flushProgrammes = async (write: (chunk: string) => Promise<void>) => {
    if (!programmeParts.length) return;
    await write(programmeParts.join("\n") + "\n");
    programmeParts.length = 0;
  };

  await writeGzipTextFile(destPath, async (write) => {
    await write('<?xml version="1.0" encoding="UTF-8"?>\n');
    await write('<!DOCTYPE tv SYSTEM "xmltv.dtd">\n');
    await write('<tv generator-info-name="Xtream Codes" generator-info-url="">\n');

    for (let i = 0; i < channels.length; i += CHANNEL_WRITE_BATCH) {
      const batch = channels.slice(i, i + CHANNEL_WRITE_BATCH);
      const epgIds = new Set<string>();
      for (const c of batch) {
        const epgId = c.epg_id?.trim();
        if (epgId) {
          epgIds.add(epgId);
          epgIds.add(epgId.toLowerCase());
        }
        const extra = c.stream_channel_id?.trim();
        if (extra) {
          epgIds.add(extra);
          epgIds.add(extra.toLowerCase());
        }
      }
      const programs = epgIds.size ? await loadProgramsForEpgIds([...epgIds], now, until) : [];
      const programsByChannel = new Map<string, ProgramRow[]>();
      for (const p of programs) {
        for (const key of new Set([p.channelId, p.channelId.toLowerCase()])) {
          const list = programsByChannel.get(key) ?? [];
          list.push(p);
          programsByChannel.set(key, list);
        }
      }

      for (const row of batch) {
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
          channelLines.push(
            `  <channel id="${xmltvSafeText(id)}"><display-name>${xmltvSafeText(row.name) || "Live"}</display-name></channel>`
          );
        }
        for (const p of uniqueListings) {
          for (const channelId of catalogIds) {
            const key = `${channelId}|${p.start.toISOString()}|${p.title}`;
            if (programSeen.has(key)) continue;
            programSeen.add(key);
            const ch = xmltvSafeText(channelId);
            if (!ch) continue;
            const desc = truncateXmltvDesc(p.description);
            programmeParts.push(
              `  <programme start="${formatXmltvDateForXtreamApps(p.start, panelTimezone)}" stop="${formatXmltvDateForXtreamApps(p.stop, panelTimezone)}" channel="${ch}">`,
              `    <title lang="en">${xmltvSafeText(p.title) || "Programme"}</title>`
            );
            if (desc) programmeParts.push(`    <desc lang="en">${xmltvSafeText(desc)}</desc>`);
            programmeParts.push("  </programme>");
          }
        }
      }
      if (programmeParts.length > 400) {
        /* hold until channels written */
      }
      await yieldEventLoop();
    }

    if (channelLines.length) await write(channelLines.join("\n") + "\n");
    await flushProgrammes(write);
    await write("</tv>\n");
  });
}
