import { cacheGet, cacheSet } from "@/lib/cache";

const SUBTITLE_PREFIX = "subtitle:";

export type SubtitleTrack = {
  id: string;
  streamId: string;
  language: string;
  label: string;
  format: "srt" | "vtt" | "ass";
  url: string;
  isDefault: boolean;
};

export async function getSubtitleTracks(streamId: string): Promise<SubtitleTrack[]> {
  const cached = await cacheGet<SubtitleTrack[]>(`${SUBTITLE_PREFIX}${streamId}`);
  if (cached) return cached;
  return [];
}

export async function addSubtitleTrack(
  streamId: string,
  language: string,
  label: string,
  format: SubtitleTrack["format"],
  url: string,
  isDefault: boolean = false
): Promise<SubtitleTrack> {
  const track: SubtitleTrack = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    language,
    label,
    format,
    url,
    isDefault,
  };

  const tracks = await getSubtitleTracks(streamId);
  tracks.push(track);
  await cacheSet(`${SUBTITLE_PREFIX}${streamId}`, tracks, 86400);
  return track;
}

export async function deleteSubtitleTrack(trackId: string): Promise<boolean> {
  const tracks = await getSubtitleTracks(trackId);
  const filtered = tracks.filter((t) => t.id !== trackId);
  await cacheSet(`${SUBTITLE_PREFIX}${trackId}`, filtered, 86400);
  return true;
}
