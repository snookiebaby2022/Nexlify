import { prisma } from "@/lib/prisma";
import type { LineWithBouquets } from "@/lib/lines";
import { Prisma, StreamType } from "@prisma/client";
import { formatXmltvDateInTimezone } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";
import { cacheGetOrSet } from "@/lib/cache";

const XMLTV_CACHE_SEC = 180;
const PROGRAMS_PER_CHANNEL = 8;
const DESC_MAX_CHARS = 160;

function truncateXmltvDesc(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= DESC_MAX_CHARS) return text;
  return `${text.slice(0, DESC_MAX_CHARS - 1).trimEnd()}…`;
}

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead = 12): Promise<string> {
  const cacheKey = `xmltv:v3:${line.id}:${hoursAhead}:${PROGRAMS_PER_CHANNEL}`;
  return cacheGetOrSet(cacheKey, XMLTV_CACHE_SEC, () => buildLineXmltvBody(line, hoursAhead));
}

async function buildLineXmltvBody(line: LineWithBouquets, hoursAhead: number): Promise<string> {
  const general = await getSettingGroup("general");
  const panelTimezone = String(general.timezone || "Europe/London");
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);

  const rows = await prisma.$queryRaw<
    {
      epg_id: string;
      name: string;
      channelId: string | null;
      title: string | null;
      description: string | null;
      start: Date | null;
      stop: Date | null;
    }[]
  >`
    WITH line_channels AS (
      SELECT DISTINCT
        COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id) AS epg_id,
        s.name
      FROM "LineBouquet" lb
      INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE lb."lineId" = ${line.id}
        AND s.type = ${StreamType.LIVE}::"StreamType"
        AND s."isActive" = true
        AND NULLIF(TRIM(s."epgChannelId"), '') IS NOT NULL
    ),
    ranked_programs AS (
      SELECT
        p."channelId",
        p.title,
        p.description,
        p.start,
        p.stop,
        ROW_NUMBER() OVER (PARTITION BY p."channelId" ORDER BY p.start ASC) AS rn
      FROM "EpgProgram" p
      INNER JOIN line_channels lc ON lc.epg_id = p."channelId"
      WHERE p.stop >= ${now}
        AND p.start <= ${until}
    )
    SELECT
      lc.epg_id,
      lc.name,
      rp."channelId",
      rp.title,
      rp.description,
      rp.start,
      rp.stop
    FROM line_channels lc
    LEFT JOIN ranked_programs rp ON rp."channelId" = lc.epg_id AND rp.rn <= ${PROGRAMS_PER_CHANNEL}
    ORDER BY lc.epg_id ASC, rp.start ASC NULLS LAST
  `;

  const channelMap = new Map<string, string>();
  const programRows: {
    channelId: string;
    title: string;
    description: string | null;
    start: Date;
    stop: Date;
  }[] = [];

  for (const row of rows) {
    const id = String(row.epg_id || "").trim();
    if (!id) continue;
    if (!channelMap.has(id)) channelMap.set(id, row.name || "Live");
    if (row.channelId && row.start && row.stop && row.title) {
      programRows.push({
        channelId: String(row.channelId),
        title: row.title,
        description: truncateXmltvDesc(row.description),
        start: row.start,
        stop: row.stop,
      });
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
