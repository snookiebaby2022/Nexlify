import { prisma } from "@/lib/prisma";
import { streamsForLineExport, type LineWithBouquets } from "@/lib/lines";
import { resolveEpgId } from "@/lib/subscription-export";
import { StreamType } from "@prisma/client";

function formatXmltvDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`
  );
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build XMLTV guide for a line's live channels (from synced EPG sources). */
export async function buildLineXmltv(line: LineWithBouquets, hoursAhead = 48): Promise<string> {
  const streams = (await streamsForLineExport(line)).filter((s) => s.type === StreamType.LIVE);
  const channelMap = new Map<string, string>();
  for (const s of streams) {
    const epgId = resolveEpgId(s);
    if (!channelMap.has(epgId)) channelMap.set(epgId, s.name);
  }

  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);
  const channelIds = [...channelMap.keys()];

  const programs =
    channelIds.length > 0
      ? await prisma.epgProgram.findMany({
          where: {
            channelId: { in: channelIds },
            stop: { gte: now },
            start: { lte: until },
          },
          orderBy: [{ channelId: "asc" }, { start: "asc" }],
          take: 5000,
        })
      : [];

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<tv>"];
  for (const [id, name] of channelMap) {
    lines.push(`  <channel id="${escXml(id)}"><display-name>${escXml(name)}</display-name></channel>`);
  }
  for (const p of programs) {
    lines.push(
      `  <programme start="${formatXmltvDate(p.start)}" stop="${formatXmltvDate(p.stop)}" channel="${escXml(p.channelId)}">`,
      `    <title>${escXml(p.title)}</title>`
    );
    if (p.description) lines.push(`    <desc>${escXml(p.description)}</desc>`);
    lines.push("  </programme>");
  }
  lines.push("</tv>");
  return lines.join("\n");
}
