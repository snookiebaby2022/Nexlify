import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { isPluginEntitled } from "@/lib/plugin-entitlement";

export async function isArchivePackEnabled(panelHost?: string): Promise<boolean> {
  const entitled = await isPluginEntitled("archive_timeshift", panelHost);
  if (!entitled.ok) return false;
  const s = await getSettingGroup("archive-pack" as never);
  return s.enabled === true;
}

export type ArchiveJob = {
  streamId: string;
  streamName: string;
  epgChannelId: string | null;
  retentionDays: number;
  storagePath: string;
  outputFormat: "hls" | "dash";
};

export async function listArchiveJobs(): Promise<ArchiveJob[]> {
  const settings = await getSettingGroup("archive-pack" as never);
  if (!(await isArchivePackEnabled())) return [];

  const retentionDays = Number(settings.defaultRetentionDays ?? 7);
  const storagePath = String(settings.storagePath ?? "/var/nexlify/archive");
  const outputFormat = settings.outputFormat === "dash" ? "dash" : "hls";
  const epgLinked = settings.epgLinkedRecording !== false;

  const streams = await prisma.stream.findMany({
    where: {
      isActive: true,
      type: "LIVE",
      OR: [{ vodMode: "CATCHUP" }, { archiveDays: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      epgChannelId: true,
      archiveDays: true,
    },
    take: 500,
  });

  return streams.map((s) => ({
    streamId: s.id,
    streamName: s.name,
    epgChannelId: epgLinked ? s.epgChannelId : null,
    retentionDays: s.archiveDays ?? retentionDays,
    storagePath,
    outputFormat,
  }));
}

export function archivePlaybackUrl(
  baseUrl: string,
  streamId: string,
  fromUnix: number,
  durationSec: number
): string {
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}/archive/${streamId}/index.m3u8?from=${fromUnix}&dur=${durationSec}`;
}
