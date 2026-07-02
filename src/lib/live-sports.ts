import { getSettingGroup } from "@/lib/panel-settings";
import {
  buildAuthHeaders,
  normalizeApiRowFromResponse,
  parseLiveSportsSettings,
  providerFromPreset,
  type LiveSportsProvider,
} from "@/lib/live-sports-types";

export type SportsMatch = {
  id: number;
  league: string;
  home: string;
  away: string;
  status: string;
  time: string;
  source?: string;
  sortAt: number;
};

async function fetchProviderRows(provider: LiveSportsProvider, revalidate?: number): Promise<SportsMatch[]> {
  const url = provider.fixturesUrl.trim();
  if (!url || !provider.apiKey.trim() || !provider.enabled) return [];

  try {
    const res = await fetch(url, {
      headers: buildAuthHeaders(provider),
      ...(revalidate != null ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: Record<string, unknown>[] };
    return (data.response ?? [])
      .map((row) => normalizeApiRowFromResponse(row, provider.label))
      .filter((m): m is SportsMatch => m != null);
  } catch {
    return [];
  }
}

async function resolveProviders(): Promise<LiveSportsProvider[]> {
  const settings = parseLiveSportsSettings(await getSettingGroup("live-sports"));
  if (!settings.enabled) return [];

  const fromPanel = settings.providers.filter((p) => p.enabled && p.fixturesUrl.trim() && p.apiKey.trim());
  if (fromPanel.length) return fromPanel;

  const envKey = process.env.API_SPORTS_KEY?.trim();
  if (envKey) {
    return [providerFromPreset(0, envKey)];
  }

  return [];
}

export async function getLiveSportsSettingsForAdmin() {
  return parseLiveSportsSettings(await getSettingGroup("live-sports"));
}

/** Upcoming fixtures from all configured sports API providers. */
export async function getUpcomingSportsFixtures(): Promise<{
  matches: Omit<SportsMatch, "sortAt">[];
  configured: boolean;
  providerCount: number;
}> {
  const providers = await resolveProviders();
  if (!providers.length) {
    return { configured: false, matches: [], providerCount: 0 };
  }

  const settings = parseLiveSportsSettings(await getSettingGroup("live-sports"));
  const batches = await Promise.all(providers.map((p) => fetchProviderRows(p, settings.cacheTtlSec)));

  const merged = batches
    .flat()
    .sort((a, b) => a.sortAt - b.sortAt)
    .slice(0, 24)
    .map(({ sortAt: _s, ...m }) => m);

  return {
    configured: true,
    matches: merged,
    providerCount: providers.length,
  };
}

export async function testSportsProvider(provider: LiveSportsProvider): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  if (!provider.fixturesUrl.trim() || !provider.apiKey.trim()) {
    return { ok: false, count: 0, error: "URL and API key are required" };
  }
  try {
    const res = await fetch(provider.fixturesUrl.trim(), {
      headers: buildAuthHeaders(provider),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, count: 0, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { response?: unknown[]; errors?: Record<string, string> };
    if (data.errors && Object.keys(data.errors).length) {
      return { ok: false, count: 0, error: Object.values(data.errors).join("; ") };
    }
    const matches = await fetchProviderRows(provider);
    return { ok: true, count: matches.length || (data.response?.length ?? 0) };
  } catch (e) {
    return { ok: false, count: 0, error: e instanceof Error ? e.message : "Request failed" };
  }
}
