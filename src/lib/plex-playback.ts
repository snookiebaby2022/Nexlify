import { plexRequestHeaders } from "@/lib/plex-config";

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
  const key = String(raw ?? "direct").toLowerCase();
  return { ...(PROFILES[key] ?? PROFILES.direct) };
}

export type PlexJsonMetadata = {
  ratingKey?: string;
  key?: string;
  title?: string;
  type?: string;
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

function describePlexFetchFailure(e: unknown): string {
  if (!(e instanceof Error)) return "Could not reach Plex.";
  const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ?? "";
  const blob = `${e.name} ${e.message} ${cause?.message ?? ""} ${code}`;
  if (e.name === "TimeoutError" || /timeout|aborted/i.test(blob)) {
    return "Plex timed out. This VPS must be able to reach the Plex host and port.";
  }
  if (code === "ECONNREFUSED") return "Plex refused the connection. Check IP and port.";
  if (code === "ENOTFOUND") return "Could not resolve the Plex hostname.";
  if (/certificate|CERT_|SSL|UNABLE_TO_VERIFY/i.test(blob)) {
    return "Plex TLS/certificate failed. Use http:// for a raw IP, or the *.plex.direct hostname.";
  }
  if (e.message && e.message !== "fetch failed") return e.message;
  return "Could not reach Plex. Check host, port, and firewall.";
}

export async function fetchPlexJson<T>(
  url: string,
  clientIdentifier = "nexlify-panel",
  timeoutMs = 45_000
): Promise<T> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Plex URL");
  }
  const token = parsed.searchParams.get("X-Plex-Token") ?? "";
  let res: Response;
  try {
    res = await fetch(url, {
      headers: plexRequestHeaders(token, clientIdentifier),
      signal: AbortSignal.timeout(Math.max(3_000, timeoutMs)),
    });
  } catch (e) {
    throw new Error(describePlexFetchFailure(e));
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        "Plex rejected the token (HTTP 401). Paste only the X-Plex-Token value from Plex Web → Get Info → View XML, or fill username and password."
      );
    }
    if (res.status === 403) throw new Error("Plex denied access (HTTP 403).");
    throw new Error(`Plex API HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return res.json() as Promise<T>;
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Plex returned a non-JSON response. Check the token and server URL.");
  }
}
