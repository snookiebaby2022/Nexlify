import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const TRANSCODE_PREFIX = "transcode:";
const SETTING_KEY = "transcoding_profiles";

export type TranscodingProfile = {
  id: string;
  name: string;
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
  isActive: boolean;
};

async function persist(profiles: TranscodingProfile[]) {
  await cacheSet(`${TRANSCODE_PREFIX}profiles`, profiles, 86400);
  await prisma.panelSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(profiles) },
    update: { value: JSON.stringify(profiles) },
  });
}

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
  for (const p of profiles) p.isActive = false;
  profiles.push(profile);
  await persist(profiles);
  return profile;
}

export async function getTranscodingProfiles(): Promise<TranscodingProfile[]> {
  const cached = await cacheGet<TranscodingProfile[]>(`${TRANSCODE_PREFIX}profiles`);
  if (cached?.length) return cached;
  try {
    const row = await prisma.panelSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row?.value) {
      const parsed = JSON.parse(row.value) as TranscodingProfile[];
      if (Array.isArray(parsed)) {
        await cacheSet(`${TRANSCODE_PREFIX}profiles`, parsed, 86400);
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

export async function getActiveTranscodingProfile(): Promise<TranscodingProfile | null> {
  const profiles = await getTranscodingProfiles();
  return profiles.find((p) => p.isActive) ?? null;
}

export async function deleteTranscodingProfile(profileId: string): Promise<boolean> {
  const profiles = (await getTranscodingProfiles()).filter((p) => p.id !== profileId);
  await persist(profiles);
  return true;
}

/** First active profile — used as the live transcode output when a stream is in transcode mode. */
export async function getActiveTranscodingProfile(): Promise<TranscodingProfile | null> {
  const profiles = await getTranscodingProfiles();
  return profiles.find((p) => p.isActive) ?? profiles[0] ?? null;
}
