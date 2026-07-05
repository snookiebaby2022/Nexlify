import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const AUDIO_PREFIX = "audio:";

export type AudioTrack = {
  id: string;
  streamId: string;
  language: string;
  label: string;
  isDefault: boolean;
  codec: string;
  bitrate: number;
};

export async function getAudioTracks(streamId: string): Promise<AudioTrack[]> {
  const cached = await cacheGet<AudioTrack[]>(`${AUDIO_PREFIX}${streamId}`);
  if (cached) return cached;

  // In a real implementation, this would detect audio tracks from the stream
  // For now, return empty array (would be populated by stream analysis)
  return [];
}

export async function addAudioTrack(
  streamId: string,
  language: string,
  label: string,
  isDefault: boolean = false
): Promise<AudioTrack> {
  const track: AudioTrack = {
    id: `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    language,
    label,
    isDefault,
    codec: "aac",
    bitrate: 128,
  };

  const tracks = await getAudioTracks(streamId);
  tracks.push(track);
  await cacheSet(`${AUDIO_PREFIX}${streamId}`, tracks, 86400);
  return track;
}

export async function deleteAudioTrack(trackId: string): Promise<boolean> {
  const tracks = await getAudioTracks(trackId);
  const filtered = tracks.filter((t) => t.id !== trackId);
  await cacheSet(`${AUDIO_PREFIX}${trackId}`, filtered, 86400);
  return true;
}
