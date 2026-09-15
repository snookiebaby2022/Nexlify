import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import {
  liveCanonicalChannelKey,
  liveDuplicateTierForGrouping,
  liveStreamQualityTier,
} from "@/lib/live-title-tier";

const TIER_SUFFIX: Record<string, string> = {
  uhd: "UHD",
  fhd: "FHD",
  hd: "HD",
  sd: "SD",
};

function preferredDisplayName(names: string[]): string {
  const scored = names.map((name) => {
    let score = 0;
    if (/^[A-Z]/.test(name)) score += 2;
    if (!/^(uk|us|usa|ie)\s*[|:]/i.test(name)) score += 4;
    if (/\b(FHD|HD|SD|UHD|4K)\b/i.test(name)) score += 1;
    score += Math.min(name.length, 40) / 40;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.name ?? names[0] ?? "";
}

function applyTierSuffix(base: string, name: string): string {
  const tier = liveStreamQualityTier(name);
  const suffix = TIER_SUFFIX[tier];
  const stripped = base
    .replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|576p|480p|2160p)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!suffix) return stripped || base;
  if (new RegExp(`\\b${suffix}\\b`, "i").test(stripped)) return stripped;
  return `${stripped} ${suffix}`.trim();
}

export type TitleSyncGroup = {
  key: string;
  tier: string;
  canonical: string;
  suggested: string;
  streams: { id: string; name: string; categoryName: string | null; epgChannelId: string | null }[];
};

export async function listTitleSyncGroups(opts?: {
  categoryId?: string;
  limit?: number;
}): Promise<TitleSyncGroup[]> {
  const streams = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
    },
    select: {
      id: true,
      name: true,
      epgChannelId: true,
      category: { select: { name: true } },
    },
    take: Math.min(20_000, Math.max(100, opts?.limit ?? 8_000)),
  });

  const buckets = new Map<string, typeof streams>();
  for (const s of streams) {
    const canonical = liveCanonicalChannelKey(s.name);
    if (!canonical) continue;
    const tier = liveDuplicateTierForGrouping(s.name);
    const key = `${canonical}::${tier}`;
    const list = buckets.get(key) ?? [];
    list.push(s);
    buckets.set(key, list);
  }

  const groups: TitleSyncGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const names = list.map((s) => s.name);
    const unique = new Set(names.map((n) => n.trim().toLowerCase()));
    if (unique.size < 2) continue;
    const preferred = preferredDisplayName(names);
    const [canonical, tier] = key.split("::");
    groups.push({
      key,
      tier: tier ?? "fhd",
      canonical: canonical ?? "",
      suggested: applyTierSuffix(preferred, preferred),
      streams: list.map((s) => ({
        id: s.id,
        name: s.name,
        categoryName: s.category?.name ?? null,
        epgChannelId: s.epgChannelId,
      })),
    });
  }

  groups.sort((a, b) => b.streams.length - a.streams.length);
  return groups;
}

export async function applyTitleSync(opts: {
  streamIds: string[];
  suggested: string;
}): Promise<number> {
  const suggested = opts.suggested.trim();
  if (!suggested) throw new Error("Suggested title required");
  const ids = [...new Set(opts.streamIds.filter(Boolean))];
  if (!ids.length) return 0;

  const streams = await prisma.stream.findMany({
    where: { id: { in: ids }, type: StreamType.LIVE },
    select: { id: true, name: true },
  });

  let updated = 0;
  for (const stream of streams) {
    const next = applyTierSuffix(suggested, stream.name);
    if (next === stream.name) continue;
    await prisma.stream.update({ where: { id: stream.id }, data: { name: next } });
    updated++;
  }
  return updated;
}
