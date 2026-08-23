import { prisma } from "@/lib/prisma";
import type { LineWithBouquets } from "@/lib/lines";
import { Prisma, StreamType } from "@prisma/client";
import { formatXmltvDateInTimezone } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";

const PROGRAMS_PER_CHANNEL = 8;
const DESC_MAX_CHARS = 160;
const EPG_ID_CHUNK = 400;

function truncateXmltvDesc(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= DESC_MAX_CHARS) return text;
  return `${text.slice(0, DESC_MAX_CHARS - 1).trimEnd()}…`;
}

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead = 12): Promise<string> {
  return buildLineXmltvBody(line, hoursAhead);
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
  }
  return out;
}

async function buildLineXmltvBody(line: LineWithBouquets, hoursAhead: number): Promise<string> {
  const general = await getSettingGroup("general");
  const panelTimezone = String(general.timezone || "Europe/London");
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);

  const channels = await prisma.$queryRaw<LineChannel[]>`
    SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id))
      s.id AS stream_cuid,
      COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id) AS epg_id,
      NULLIF(TRIM(s."channelId"), '') AS stream_channel_id,
      s.name
    FROM "LineBouquet" lb
    INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE lb."lineId" = ${line.id}
      AND s.type = ${StreamType.LIVE}::"StreamType"
      AND s."isActive" = true
      AND NULLIF(TRIM(s."epgChannelId"), '') IS NOT NULL
    ORDER BY COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id), s.id
  `;

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
    const key = p.channelId;
    const list = programsByChannel.get(key) ?? [];
    list.push(p);
    programsByChannel.set(key, list);
  }

  const channelMap = new Map<string, string>();
  const programSeen = new Set<string>();
  const programRows: ProgramRow[] = [];

  for (const row of channels) {
    const epgId = String(row.epg_id || "").trim();
    if (!epgId) continue;
    // Catalog epg_channel_id is the tvg-id — XCIPTV matches that, not numeric stream_id.
    const ids = [epgId];
    const extra = row.stream_channel_id?.trim();
    if (extra && extra !== epgId) ids.push(extra);
    for (const id of ids) {
      if (!channelMap.has(id)) channelMap.set(id, row.name || "Live");
    }
    const listings = [
      ...(programsByChannel.get(epgId) ?? []),
      ...(programsByChannel.get(epgId.toLowerCase()) ?? []),
      ...(extra ? programsByChannel.get(extra) ?? [] : []),
      ...(extra ? programsByChannel.get(extra.toLowerCase()) ?? [] : []),
    ];
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
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="Nexlify">',
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
      `  <programme start="${formatXmltvDateInTimezone(p.start, panelTimezone)}" stop="${formatXmltvDateInTimezone(p.stop, panelTimezone)}" channel="${ch}">`,
      `    <title>${xmltvSafeText(p.title) || "Programme"}</title>`
    );
    if (p.description) lines.push(`    <desc>${xmltvSafeText(p.description)}</desc>`);
    lines.push("  </programme>");
  }
  lines.push("</tv>");
  return lines.join("\n");
}
