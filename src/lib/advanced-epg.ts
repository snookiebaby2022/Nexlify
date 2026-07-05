import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const EPG_PREFIX = "epg:";

export type EpgSource = {
  id: string;
  name: string;
  url: string;
  format: "xmltv" | "json";
  isActive: boolean;
  lastSync: number;
  quality: number;
};

export async function createEpgSource(
  name: string,
  url: string,
  format: EpgSource["format"] = "xmltv"
): Promise<EpgSource> {
  const source: EpgSource = {
    id: `epg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    url,
    format,
    isActive: true,
    lastSync: 0,
    quality: 0,
  };

  const sources = await getEpgSources();
  sources.push(source);
  await cacheSet(`${EPG_PREFIX}sources`, sources, 86400);
  return source;
}

export async function getEpgSources(): Promise<EpgSource[]> {
  return (await cacheGet<EpgSource[]>(`${EPG_PREFIX}sources`)) ?? [];
}

export async function deleteEpgSource(sourceId: string): Promise<boolean> {
  const sources = await getEpgSources();
  const filtered = sources.filter((s) => s.id !== sourceId);
  await cacheSet(`${EPG_PREFIX}sources`, filtered, 86400);
  return true;
}

export async function syncEpgSource(sourceId: string): Promise<boolean> {
  const sources = await getEpgSources();
  const idx = sources.findIndex((s) => s.id === sourceId);
  if (idx < 0) return false;
  sources[idx].lastSync = Date.now();
  await cacheSet(`${EPG_PREFIX}sources`, sources, 86400);
  return true;
}
