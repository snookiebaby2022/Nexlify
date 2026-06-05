import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { searchTmdb } from "@/lib/tmdb";
import { StreamType } from "@prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve a logo URL for a live channel name (optional TMDB / slug CDN). */
export async function resolveAutoChannelLogo(
  channelName: string,
  opts?: { epgChannelId?: string | null }
): Promise<string | null> {
  const settings = await getSettingGroup("streams");
  if (!settings.autoChannelLogos) return null;

  const source = String(settings.autoChannelLogoSource ?? "tmdb");
  const name = channelName.trim();
  if (!name) return null;

  if (source !== "slug") {
    try {
      const hits = await searchTmdb(name, "tv");
      const logo = hits[0]?.posterUrl;
      if (logo) return logo;
    } catch {
      /* TMDB unavailable — try slug */
    }
    if (source === "tmdb") return null;
  }

  const slug = slugify(name);
  const epgSlug = opts?.epgChannelId ? slugify(opts.epgChannelId) : "";
  const candidates = [
    epgSlug ? `https://logo.iptv.org/${epgSlug}.png` : null,
    `https://logo.iptv.org/${slug}.png`,
    `https://raw.githubusercontent.com/tv-logo/tv-logos/master/countries/global/${slug}.png`,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    if (await urlExists(url)) return url;
  }

  return null;
}

export async function applyAutoLogoToStream(streamId: string): Promise<string | null> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { id: true, name: true, type: true, streamIcon: true, epgChannelId: true },
  });
  if (!stream || stream.type !== StreamType.LIVE || stream.streamIcon) return stream?.streamIcon ?? null;

  const logo = await resolveAutoChannelLogo(stream.name, { epgChannelId: stream.epgChannelId });
  if (!logo) return null;

  await prisma.stream.update({ where: { id: streamId }, data: { streamIcon: logo } });
  return logo;
}
