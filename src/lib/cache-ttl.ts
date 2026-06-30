import { getSettingGroup } from "@/lib/panel-settings";

export type CacheTtlSettings = {
  stats: number;
  epg: number;
  categories: number;
  playbackUrl: number;
};

const FALLBACK: CacheTtlSettings = {
  stats: 15,
  epg: 120,
  categories: 30,
  playbackUrl: 30,
};

let cached: { at: number; ttl: CacheTtlSettings } | null = null;
const META_TTL_MS = 5_000;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function getCacheTtls(): Promise<CacheTtlSettings> {
  if (cached && Date.now() - cached.at < META_TTL_MS) {
    return cached.ttl;
  }

  const settings = await getSettingGroup("cache");
  const ttl: CacheTtlSettings = {
    stats: clamp(Number(settings.statsTtlSeconds), 5, 300),
    epg: clamp(Number(settings.epgTtlSeconds), 30, 3600),
    categories: clamp(Number(settings.categoriesTtlSeconds), 10, 600),
    playbackUrl: clamp(Number(settings.playbackUrlCacheTtlSec), 5, 300),
  };

  cached = { at: Date.now(), ttl };
  return ttl;
}

export function resetCacheTtlMemo() {
  cached = null;
}

export function fallbackCacheTtls(): CacheTtlSettings {
  return { ...FALLBACK };
}
