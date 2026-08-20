import { prisma } from "@/lib/prisma";
import type { LineWithBouquets } from "@/lib/lines";
import { Prisma, StreamType } from "@prisma/client";
import { formatXmltvDateInTimezone } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";

const lineLiveEpgIdsSql = (lineId: string) => Prisma.sql`
  SELECT DISTINCT COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id) AS epg_id
  FROM "LineBouquet" lb
  INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
  INNER JOIN "Stream" s ON s.id = bs."streamId"
  WHERE lb."lineId" = ${lineId}
    AND s.type = ${StreamType.LIVE}::"StreamType"
    AND s."isActive" = true
`;

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead = 24): Promise<string> {
  const general = await getSettingGroup("general");
  const panelTimezone = String(general.timezone || "Europe/London");
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);

  const channelRows = await prisma.$queryRaw<{ epg_id: string; name: string }[]>`
    SELECT DISTINCT
      COALESCE(NULLIF(TRIM(s."epgChannelId"), ''), s.id) AS epg_id,
      s.name
    FROM "LineBouquet" lb
    INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE lb."lineId" = ${line.id}
      AND s.type = ${StreamType.LIVE}::"StreamType"
      AND s."isActive" = true
  `;

  const channelMap = new Map<string, string>();
  for (const row of channelRows) {
    const id = String(row.epg_id || "").trim();
    if (!id) continue;
    if (!channelMap.has(id)) channelMap.set(id, row.name || "Live");
  }

  const programs =
    channelMap.size > 0
      ? await prisma.$queryRaw<
          { channelId: string; title: string; description: string | null; start: Date; stop: Date }[]
        >`
          SELECT "channelId", title, description, start, stop
          FROM (
            SELECT
              p."channelId",
              p.title,
              p.description,
              p.start,
              p.stop,
              ROW_NUMBER() OVER (PARTITION BY p."channelId" ORDER BY p.start ASC) AS rn
            FROM "EpgProgram" p
            WHERE p."channelId" IN (${lineLiveEpgIdsSql(line.id)})
              AND p.stop >= ${now}
              AND p.start <= ${until}
          ) ranked
          WHERE rn <= 24
          ORDER BY "channelId" ASC, start ASC
        `
      : [];

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<tv>"];
  for (const [id, name] of channelMap) {
    lines.push(
      `  <channel id="${xmltvSafeText(id)}"><display-name>${xmltvSafeText(name) || "Live"}</display-name></channel>`
    );
  }
  for (const p of programs) {
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
