export type PlexTranscodeProfile = {
  maxVideoBitrateKbps?: number;
  videoResolution?: string;
  preferDirectPlay?: boolean;
  audioBoost?: number;
  subtitleSize?: number;
};

const PROFILES: Record<string, PlexTranscodeProfile> = {
  "1080p": { maxVideoBitrateKbps: 12000, videoResolution: "1920x1080" },
  "720p": { maxVideoBitrateKbps: 4000, videoResolution: "1280x720" },
  "480p": { maxVideoBitrateKbps: 2000, videoResolution: "720x480" },
  direct: { preferDirectPlay: true, maxVideoBitrateKbps: 20000, videoResolution: "1920x1080" },
};

export function resolvePlexProfile(raw: unknown): PlexTranscodeProfile {
  const key = String(raw ?? "1080p").toLowerCase();
  return { ...PROFILES["1080p"], ...(PROFILES[key] ?? {}) };
}

type PlexJsonMetadata = {
  ratingKey?: string;
  key?: string;
  title?: string;
  Media?: {
    id?: string;
    Part?: { key?: string; file?: string; decision?: string }[];
    videoResolution?: string;
  }[];
};

export function buildPlexDirectPartUrl(base: string, token: string, partKey: string): string {
  const path = partKey.startsWith("/") ? partKey : `/${partKey}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${base.replace(/\/$/, "")}${path}${sep}X-Plex-Token=${encodeURIComponent(token)}`;
}

export function buildPlexTranscodeM3u8(
  base: string,
  token: string,
  ratingKey: string,
  profile: PlexTranscodeProfile
): string {
  const root = base.replace(/\/$/, "");
  const path = encodeURIComponent(`/library/metadata/${ratingKey}`);
  const params = new URLSearchParams({
    "X-Plex-Token": token,
    path,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    directPlay: profile.preferDirectPlay ? "1" : "0",
    directStream: profile.preferDirectPlay ? "1" : "0",
    subtitleSize: String(profile.subtitleSize ?? 100),
    audioBoost: String(profile.audioBoost ?? 100),
    maxVideoBitrate: String(profile.maxVideoBitrateKbps ?? 12000),
    videoResolution: profile.videoResolution ?? "1920x1080",
  });
  return `${root}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
}

export function pickPlexPlaybackUrl(
  base: string,
  token: string,
  item: PlexJsonMetadata,
  profile: PlexTranscodeProfile
): string | null {
  const ratingKey = item.ratingKey ?? item.key?.replace("/library/metadata/", "");
  if (!ratingKey) return null;

  const media = item.Media?.[0];
  const part = media?.Part?.[0];
  if (profile.preferDirectPlay && part?.key) {
    return buildPlexDirectPartUrl(base, token, part.key);
  }

  return buildPlexTranscodeM3u8(base, token, String(ratingKey), profile);
}

export async function fetchPlexJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Plex API ${res.status}`);
  return res.json() as Promise<T>;
}
