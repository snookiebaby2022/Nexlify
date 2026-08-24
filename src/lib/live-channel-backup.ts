import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";

/** Hosts already known dead in live geo failover — never copy them as backups. */
export const SKIP_LIVE_BACKUP_HOSTS = ["xplatinmedia.com"];

export function streamPlaybackHost(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Strip quality / Icons suffixes so HD, FHD, HEVC, and rebranded Select/Icons share a key. */
export function liveChannelBackupKey(name: string): string {
  let s = String(name ?? "").toLowerCase();
  s = s.replace(/\s*\/\s*icons\b/g, " ");
  s = s.replace(/\bicons\b/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(
    /\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|2160p|hevc|h\.?265|h\.?264|x265|x264|hdr10|hdr|eac3|ac3|5\.1|hb|lb)\b/g,
    " "
  );
  return s.replace(/[^a-z0-9]+/g, "");
}

/** ILIKE stem for finding sibling live rows without scanning the whole catalog. */
export function liveChannelSearchStem(name: string): string {
  let s = String(name ?? "");
  s = s.replace(/\s*\/\s*Icons\b/gi, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|2160p|hevc|h\.?265|hb|lb|5\.1|eac3)\b/gi, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, 48);
}

export function pickSiblingBackupUrl(
  stream: { id: string; name: string; streamUrl: string },
  siblings: { id: string; name: string; streamUrl: string }[]
): string | null {
  const key = liveChannelBackupKey(stream.name);
  if (key.length < 8) return null;
  const host = streamPlaybackHost(stream.streamUrl);
  for (const sib of siblings) {
    if (sib.id === stream.id) continue;
    if (liveChannelBackupKey(sib.name) !== key) continue;
    const sibHost = streamPlaybackHost(sib.streamUrl);
    if (!sibHost || (host && sibHost === host)) continue;
    if (SKIP_LIVE_BACKUP_HOSTS.some((h) => sibHost.includes(h))) continue;
    const url = sib.streamUrl.trim();
    if (url && /^https?:\/\//i.test(url) && url !== stream.streamUrl.trim()) return url;
  }
  return null;
}

export async function findSiblingLiveBackupUrl(stream: {
  id: string;
  name: string;
  streamUrl: string;
}): Promise<string | null> {
  const stem = liveChannelSearchStem(stream.name);
  if (stem.length < 8) return null;
  const siblings = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      isActive: true,
      id: { not: stream.id },
      name: { contains: stem, mode: "insensitive" },
    },
    select: { id: true, name: true, streamUrl: true },
    take: 40,
  });
  return pickSiblingBackupUrl(stream, siblings);
}
