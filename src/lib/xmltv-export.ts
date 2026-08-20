import { prisma } from "@/lib/prisma";
import { streamsForLineExport, type LineWithBouquets } from "@/lib/lines";
import { resolveEpgId } from "@/lib/subscription-export";
import { Prisma, StreamType } from "@prisma/client";
import { formatXmltvDateInTimezone } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { xmltvSafeText } from "@/lib/xtream-safe";

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead = 24): Promise<string> {
  const general = await getSettingGroup("general");
  const panelTimezone = String(general.timezone || "Europe/London");
  const streams = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
  const channelMap = new Map<string, string>();
  for (const s of streams) {
    const epgId = String(resolveEpgId(s) || s.id).trim();
    if (!epgId) continue;
    if (!channelMap.has(epgId)) channelMap.set(epgId, s.name || "Live");
  }

  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);
  const channelIds = [...channelMap.keys()];

  const programs =
    channelIds.length > 0
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
            WHERE p."channelId" IN (${Prisma.join(channelIds)})
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
