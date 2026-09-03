import { cacheGet, cacheSet } from "@/lib/cache";

const SOCIAL_PREFIX = "social:";

export type SocialPlatform = {
  id: string;
  name: string;
  type: "youtube" | "twitch" | "facebook" | "twitter" | "instagram";
  apiKey?: string;
  streamKey?: string;
  isActive: boolean;
};

export type LiveSession = {
  id: string;
  platformId: string;
  streamId: string;
  title: string;
  startedAt: number;
  viewers: number;
  status: "live" | "ended" | "error";
};

export async function getSocialPlatforms(): Promise<SocialPlatform[]> {
  const cached = await cacheGet<SocialPlatform[]>(`${SOCIAL_PREFIX}platforms`);
  if (cached) return cached;

  // Default platforms
  const platforms: SocialPlatform[] = [
    { id: "youtube", name: "YouTube Live", type: "youtube", isActive: false },
    { id: "twitch", name: "Twitch", type: "twitch", isActive: false },
    { id: "facebook", name: "Facebook Live", type: "facebook", isActive: false },
    { id: "twitter", name: "Twitter/X", type: "twitter", isActive: false },
    { id: "instagram", name: "Instagram Live", type: "instagram", isActive: false },
  ];

  await cacheSet(`${SOCIAL_PREFIX}platforms`, platforms, 86400);
  return platforms;
}

export async function startSocialStream(
  platformId: string,
  streamId: string,
  title: string
): Promise<LiveSession | null> {
  const platform = (await getSocialPlatforms()).find(p => p.id === platformId);
  if (!platform || !platform.isActive) return null;

  const session: LiveSession = {
    id: `social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platformId,
    streamId,
    title,
    startedAt: Date.now(),
    viewers: 0,
    status: "live",
  };

  // Store session
  const sessions = await cacheGet<LiveSession[]>(`${SOCIAL_PREFIX}sessions`) ?? [];
  sessions.push(session);
  await cacheSet(`${SOCIAL_PREFIX}sessions`, sessions, 86400);

  return session;
}

export async function endSocialStream(sessionId: string): Promise<boolean> {
  const sessions = await cacheGet<LiveSession[]>(`${SOCIAL_PREFIX}sessions`) ?? [];
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return false;

  sessions[idx].status = "ended";
  await cacheSet(`${SOCIAL_PREFIX}sessions`, sessions, 86400);
  return true;
}

export async function getActiveSocialStreams(): Promise<LiveSession[]> {
  const sessions = await cacheGet<LiveSession[]>(`${SOCIAL_PREFIX}sessions`) ?? [];
  return sessions.filter(s => s.status === "live");
}

export async function updateSocialPlatform(
  platformId: string,
  updates: Partial<SocialPlatform>
): Promise<boolean> {
  const platforms = await getSocialPlatforms();
  const idx = platforms.findIndex(p => p.id === platformId);
  if (idx < 0) return false;

  platforms[idx] = { ...platforms[idx], ...updates };
  await cacheSet(`${SOCIAL_PREFIX}platforms`, platforms, 86400);
  return true;
}

export async function getSocialStats(): Promise<{
  totalStreams: number;
  activeStreams: number;
  platforms: { name: string; active: boolean; streams: number }[];
}> {
  const platforms = await getSocialPlatforms();
  const sessions = await getActiveSocialStreams();

  return {
    totalStreams: sessions.length,
    activeStreams: sessions.filter(s => s.status === "live").length,
    platforms: platforms.map(p => ({
      name: p.name,
      active: p.isActive,
      streams: sessions.filter(s => s.platformId === p.id).length,
    })),
  };
}
