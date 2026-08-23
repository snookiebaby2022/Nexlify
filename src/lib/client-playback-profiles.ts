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
    // Prefetch during catalog update starts HLS ffmpeg and leaves live rows open.
    zapPrefetchOnPlaylist: false,
  },
  xciptv: {
    id: "xciptv",
    label: "XCIPTV",
    liveOutput: "ts",
    vodDirectPlay: false,
    // Prefetch during get_live_streams stalls "Update Content" and can occupy the only slot.
    zapPrefetchOnPlaylist: false,
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

/** XCIPTV/VLC pick the first allowed_output_formats token. Put mpegts first for those apps. */
export function preferLiveOutputFormats(
  formats: string[],
  profile: ClientPlaybackProfile
): string[] {
  const want = profile.liveOutput === "ts" ? "ts" : profile.liveOutput === "hls" ? "m3u8" : null;
  if (!want || !formats.includes(want)) return formats;
  return [want, ...formats.filter((f) => f !== want)];
}
