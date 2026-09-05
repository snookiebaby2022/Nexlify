import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import {
  SKIP_LIVE_BACKUP_HOSTS,
  liveChannelBackupKey,
  liveChannelSearchStem,
  streamPlaybackHost,
} from "@/lib/live-channel-backup";
import { searchRemoteProviderChannels } from "@/lib/provider-remote-catalog";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";

export type ProviderBackupMatch = {
  streamUrl: string;
  streamName: string;
  providerId: string;
  providerName: string;
  host: string;
  source: "provider" | "panel";
  score: "exact" | "stem";
};

function labelForPanelSibling(providerName: string | null | undefined, url: string): string {
  const named = String(providerName ?? "").trim();
  if (named) return named;
  const host = streamPlaybackHost(url);
  return host ? `Direct (${host})` : "Direct URL";
}

/**
 * Match a channel name against provider Xtream catalogs (same entries as the
 * provider M3U) and panel siblings, preferring a different host from primary.
 */
export async function findProviderBackupMatches(opts: {
  name: string;
  primaryUrl?: string;
  streamId?: string;
  excludeProviderId?: string;
  limit?: number;
}): Promise<ProviderBackupMatch[]> {
  const name = opts.name.trim();
  const key = liveChannelBackupKey(name);
  const stem = liveChannelSearchStem(name);
  if (key.length < 4 && stem.length < 4) return [];

  const primary = (opts.primaryUrl ?? "").trim();
  const primaryHost = primary ? streamPlaybackHost(primary) : "";
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const out: ProviderBackupMatch[] = [];
  const seen = new Set<string>();

  const push = (m: ProviderBackupMatch) => {
    const url = m.streamUrl.trim();
    if (!url || !/^https?:\/\//i.test(url) || url === primary) return;
    const host = streamPlaybackHost(url);
    if (!host || SKIP_LIVE_BACKUP_HOSTS.some((h) => host.includes(h))) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ ...m, host: m.host || host });
  };

  if (stem.length >= 4) {
    const siblings = await prisma.stream.findMany({
      where: {
        type: StreamType.LIVE,
        isActive: true,
        ...(opts.streamId ? { id: { not: opts.streamId } } : {}),
        name: { contains: stem, mode: "insensitive" },
      },
      select: {
        name: true,
        streamUrl: true,
        providerId: true,
        provider: { select: { id: true, name: true } },
      },
      take: 40,
    });
    for (const sib of siblings) {
      const sibKey = liveChannelBackupKey(sib.name);
      if (key.length >= 6 && sibKey !== key) continue;
      const host = streamPlaybackHost(sib.streamUrl);
      push({
        streamUrl: sib.streamUrl,
        streamName: sib.name,
        providerId: sib.providerId ?? sib.provider?.id ?? "",
        providerName: labelForPanelSibling(sib.provider?.name, sib.streamUrl),
        host,
        source: "panel",
        score: key.length >= 6 && sibKey === key ? "exact" : "stem",
      });
    }
  }

  const providers = await prisma.streamProvider.findMany({
    where: {
      isActive: true,
      ...(opts.excludeProviderId ? { id: { not: opts.excludeProviderId } } : {}),
    },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      apiKey: true,
      remoteUsername: true,
      remotePassword: true,
    },
    take: 40,
  });

  const query = stem.length >= 4 ? stem : name;
  for (const provider of providers) {
    const creds = resolveProviderXtreamCreds(provider);
    if (!creds.origin || !creds.username || !creds.password) continue;
    let matches: Awaited<ReturnType<typeof searchRemoteProviderChannels>> = [];
    try {
      matches = await searchRemoteProviderChannels(query, {
        providerId: provider.id,
        streamType: "LIVE",
        limit: 40,
      });
    } catch {
      continue;
    }
    for (const m of matches) {
      const mKey = liveChannelBackupKey(m.streamName);
      if (key.length >= 6 && mKey !== key) continue;
      const host = streamPlaybackHost(m.streamUrl);
      push({
        streamUrl: m.streamUrl,
        streamName: m.streamName,
        providerId: m.providerId,
        providerName: m.providerName || provider.name,
        host,
        source: "provider",
        score: key.length >= 6 && mKey === key ? "exact" : "stem",
      });
    }
  }

  out.sort((a, b) => {
    const scoreRank = (s: "exact" | "stem") => (s === "exact" ? 0 : 1);
    const hostRank = (url: string) => {
      const h = streamPlaybackHost(url);
      if (!primaryHost) return 0;
      return h && h !== primaryHost ? 0 : 1;
    };
    return scoreRank(a.score) - scoreRank(b.score) || hostRank(a.streamUrl) - hostRank(b.streamUrl);
  });

  return out.slice(0, limit);
}
