import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const TRANSCODE_PREFIX = "transcode:";

export type TranscodingProfile = {
  id: string;
  name: string;
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
  isActive: boolean;
};

export async function createTranscodingProfile(
  name: string,
  resolution: string,
  bitrate: number,
  codec: string = "h264",
  gpuAcceleration: boolean = false
): Promise<TranscodingProfile> {
  const profile: TranscodingProfile = {
    id: `transcode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    resolution,
    bitrate,
    codec,
    gpuAcceleration,
    isActive: true,
  };

  const profiles = await getTranscodingProfiles();
  profiles.push(profile);
  await cacheSet(`${TRANSCODE_PREFIX}profiles`, profiles, 86400);
  return profile;
}

export async function getTranscodingProfiles(): Promise<TranscodingProfile[]> {
  return (await cacheGet<TranscodingProfile[]>(`${TRANSCODE_PREFIX}profiles`)) ?? [];
}

export async function deleteTranscodingProfile(profileId: string): Promise<boolean> {
  const profiles = await getTranscodingProfiles();
  const filtered = profiles.filter((p) => p.id !== profileId);
  await cacheSet(`${TRANSCODE_PREFIX}profiles`, filtered, 86400);
  return true;
}
