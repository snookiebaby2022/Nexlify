/** Per-app playback tuning — XCIPTV prefers TS, Smarters HLS, etc. */

export type ClientProfileId = "auto" | "smarters" | "xciptv" | "tivimate" | "mag" | "vlc";

export type ClientPlaybackProfile = {
  id: ClientProfileId;
  label: string;
  liveOutput: "hls" | "ts" | "auto";
  vodDirectPlay: boolean;
  zapPrefetchOnPlaylist: boolean;
};

export const CLIENT_PLAYBACK_PROFILES: Record<ClientProfileId, ClientPlaybackProfile> = {
  auto: {
    id: "auto",
    label: "Auto-detect from User-Agent",
    liveOutput: "auto",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: true,
  },
  smarters: {
    id: "smarters",
    label: "IPTV Smarters / Pro",
    liveOutput: "auto",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: true,
  },
  xciptv: {
    id: "xciptv",
    label: "XCIPTV",
    liveOutput: "ts",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: true,
  },
  tivimate: {
    id: "tivimate",
    label: "TiviMate",
    liveOutput: "auto",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: true,
  },
  mag: {
    id: "mag",
    label: "MAG / Stalker",
    liveOutput: "ts",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: false,
  },
  vlc: {
    id: "vlc",
    label: "VLC / ExoPlayer",
    liveOutput: "ts",
    vodDirectPlay: false,
    zapPrefetchOnPlaylist: false,
  },
};

export function detectClientProfile(userAgent?: string | null): ClientProfileId {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("xciptv")) return "xciptv";
  if (ua.includes("smarters") || ua.includes("iptv smarters")) return "smarters";
  if (ua.includes("tivimate")) return "tivimate";
  if (ua.includes("vlc") || ua.includes("libvlc") || ua.includes("exoplayer")) return "vlc";
  if (ua.includes("mag") || ua.includes("stalker") || ua.includes("infomir")) return "mag";
  return "auto";
}

export function resolveClientPlaybackProfile(
  userAgent?: string | null,
  configured?: string | null
): ClientPlaybackProfile {
  const cfg = (configured ?? "auto").trim().toLowerCase() as ClientProfileId;
  const id =
    cfg && cfg !== "auto" && CLIENT_PLAYBACK_PROFILES[cfg]
      ? cfg
      : detectClientProfile(userAgent);
  return CLIENT_PLAYBACK_PROFILES[id] ?? CLIENT_PLAYBACK_PROFILES.auto;
}
