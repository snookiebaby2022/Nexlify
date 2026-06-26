import { cacheGetOrSet } from "@/lib/cache";
import { getSettingGroup } from "@/lib/panel-settings";

/** When true, disabled streams/bouquets are omitted from playlists and Xtream exports. */
export async function excludeDisabledFromExport(): Promise<boolean> {
  return cacheGetOrSet("settings:excludeDisabledExport", 60, async () => {
    const streams = await getSettingGroup("streams");
    return streams.excludeDisabledFromExport !== false;
  });
}
