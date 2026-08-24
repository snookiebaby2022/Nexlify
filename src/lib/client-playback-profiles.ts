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
    // PC Smarters is LibVLC and cannot play a fake HLS playlist that points at
    // unbounded MPEG-TS. Advertise .ts first so live/VOD open the splice path.
    liveOutput: "ts",
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

/**
 * XUI / 1-stream: a `.m3u8` URL is always an HLS playlist, never MPEG-TS bytes.
 * Instant TS-wrap is a separate fast-start shortcut for Exo/Chrome only.
 */
export function userAgentWantsHlsPlaylist(_userAgent?: string | null): boolean {
  return true;
}

/**
 * Fake EVENT playlist pointing at a live `.ts` pipe. ExoPlayer/Chrome can play it;
 * LibVLC (Smarters HLS, XCIPTV VLC) shows a black screen.
 */
export function userAgentAllowsInstantTsWrap(userAgent?: string | null): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return false;
  if (
    ua.includes("smarters") ||
    ua.includes("libvlc") ||
    ua.includes("lavf") ||
    ua.includes("vlc/")
  ) {
    return false;
  }
  if (ua.includes("exoplayer") || ua.includes("applecoremedia") || ua.includes("cfnetwork") || ua.includes("hls.js")) {
    return true;
  }
  if (ua.includes("chrome/") || ua.includes("firefox/") || ua.includes("edg/") || ua.includes("crios/")) {
    return true;
  }
  if (ua.includes("safari/") && ua.includes("version/")) return true;
  return false;
}

/** True when the player cannot use the instant TS-wrap playlist (needs real HLS or MPEG-TS). */
export function userAgentIsVlcEngine(userAgent?: string | null): boolean {
  return !userAgentAllowsInstantTsWrap(userAgent);
}
