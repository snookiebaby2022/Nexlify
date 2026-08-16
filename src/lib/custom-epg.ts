import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
import { logActivity } from "@/lib/lines";

const EPG_CACHE_PREFIX = "epg:custom:";
const EPG_MERGE_PREFIX = "epg:merged:";

export type EpgSource = {
  id: string;
  name: string;
  url: string;
  type: "xmltv" | "xtream" | "custom";
  isActive: boolean;
  priority: number;
  lastSyncAt: Date | null;
  lastError: string | null;
  channelCount: number;
  createdAt: Date;
};

export type EpgProgram = {
  channelId: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  category?: string;
  icon?: string;
};

export type MergedEpg = {
  channelId: string;
  programs: EpgProgram[];
  sources: string[];
};

export async function getEpgSources(): Promise<EpgSource[]> {
  return (await cacheGet<EpgSource[]>(`${EPG_CACHE_PREFIX}sources`)) ?? [];
}

export async function addEpgSource(
  source: Omit<EpgSource, "id" | "lastSyncAt" | "lastError" | "channelCount" | "createdAt">
): Promise<EpgSource> {
  const id = `epg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newSource: EpgSource = {
    ...source,
    id,
    lastSyncAt: null,
    lastError: null,
    channelCount: 0,
    createdAt: new Date(),
  };
  const sources = await getEpgSources();
  sources.push(newSource);
  await cacheSet(`${EPG_CACHE_PREFIX}sources`, sources, 86400);
  void logActivity("epg_source_added", { entity: "epg_source", entityId: id, meta: { name: source.name } });
  return newSource;
}

export async function updateEpgSource(
  id: string,
  updates: Partial<EpgSource>
): Promise<EpgSource | null> {
  const sources = await getEpgSources();
  const idx = sources.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  sources[idx] = { ...sources[idx], ...updates };
  await cacheSet(`${EPG_CACHE_PREFIX}sources`, sources, 86400);
  return sources[idx];
}

export async function removeEpgSource(id: string): Promise<boolean> {
  const sources = await getEpgSources();
  const filtered = sources.filter((s) => s.id !== id);
  if (filtered.length === sources.length) return false;
  await cacheSet(`${EPG_CACHE_PREFIX}sources`, filtered, 86400);
  await cacheDel(`${EPG_CACHE_PREFIX}programs:${id}`);
  void logActivity("epg_source_removed", { entity: "epg_source", entityId: id });
  return true;
}

export async function fetchEpgFromSource(
  source: EpgSource
): Promise<{ programs: EpgProgram[]; error?: string }> {
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "Nexlify-EPG/1.0" },
    });
    if (!res.ok) return { programs: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    return parseXmltv(text);
  } catch (err) {
    return {
      programs: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export function parseXmltv(xml: string): { programs: EpgProgram[]; error?: string } {
  const programs: EpgProgram[] = [];
  const programmeRegex = /<programme[^>]*start="([^"]*)"[^>]*stop="([^"]*)"[^>]*channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/gi;
  let match;
  while ((match = programmeRegex.exec(xml)) !== null) {
    const [, start, stop, channelId, content] = match;
    const titleMatch = content?.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descMatch = content?.match(/<desc[^>]*>([^<]*)<\/desc>/i);
    const catMatch = content?.match(/<category[^>]*>([^<]*)<\/category>/i);
    programs.push({
      channelId: channelId || "",
      title: titleMatch?.[1]?.trim() || "No title",
      start: start || "",
      end: stop || "",
      description: descMatch?.[1]?.trim(),
      category: catMatch?.[1]?.trim(),
    });
  }
  return { programs };
}

export async function syncEpgSource(id: string): Promise<{ success: boolean; channelCount: number; error?: string }> {
  const sources = await getEpgSources();
  const source = sources.find((s) => s.id === id);
  if (!source) return { success: false, channelCount: 0, error: "Source not found" };

  const result = await fetchEpgFromSource(source);
  if (result.error) {
    await updateEpgSource(id, { lastError: result.error, lastSyncAt: new Date() });
    return { success: false, channelCount: 0, error: result.error };
  }

  await cacheSet(`${EPG_CACHE_PREFIX}programs:${id}`, result.programs, 86400);
  await updateEpgSource(id, {
    lastSyncAt: new Date(),
    lastError: null,
    channelCount: result.programs.length,
  });
  return { success: true, channelCount: result.programs.length };
}

export async function getMergedEpg(channelId: string): Promise<MergedEpg> {
  const cached = await cacheGet<MergedEpg>(`${EPG_MERGE_PREFIX}${channelId}`);
  if (cached) return cached;

  const sources = await getEpgSources();
  const activeSources = sources.filter((s) => s.isActive).sort((a, b) => a.priority - b.priority);
  const allPrograms: EpgProgram[] = [];
  const sourceNames: string[] = [];

  for (const source of activeSources) {
    const programs = await cacheGet<EpgProgram[]>(`${EPG_CACHE_PREFIX}programs:${source.id}`);
    if (!programs) continue;
    const matching = programs.filter((p) => p.channelId === channelId);
    allPrograms.push(...matching);
    sourceNames.push(source.name);
  }

  allPrograms.sort((a, b) => a.start.localeCompare(b.start));
  const merged: MergedEpg = {
    channelId,
    programs: allPrograms,
    sources: sourceNames,
  };
  await cacheSet(`${EPG_MERGE_PREFIX}${channelId}`, merged, 300);
  return merged;
}

export async function syncAllEpgSources(): Promise<{ synced: number; failed: number }> {
  const sources = await getEpgSources();
  let synced = 0;
  let failed = 0;
  for (const source of sources) {
    if (!source.isActive) continue;
    const result = await syncEpgSource(source.id);
    if (result.success) synced++;
    else failed++;
  }
  return { synced, failed };
}
