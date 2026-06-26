import crypto from "node:crypto";

/**
 * Optional external relay (yt-dlp, spotdl, custom MusicKit proxy).
 *
 * Relay contract (base URL = integration relayUrl or MUSIC_RELAY_BASE_URL):
 *   GET /spotify/playlist/{id}/tracks  → { tracks: [{ id, name, streamUrl?, previewUrl?, image? }] }
 *   GET /spotify/track/{id}/stream     → { url: string }
 *   GET /apple-music/playlist/{id}/tracks?storefront=us → { tracks: [{ id, name, streamUrl?, image? }] }
 *   GET /apple-music/song/{id}/stream?storefront=us   → { url: string }
 *   GET /deezer/playlist/{id}/tracks                  → { tracks: [{ id, name, previewUrl?, image? }] }
 *   GET /deezer/track/{id}/stream                     → { url: string }
 */

const DEFAULT_RELAY_BASE = "http://127.0.0.1:8788";

export function musicRelayBase(cfg: Record<string, unknown>): string | null {
  const url = String(
    cfg.relayUrl ?? process.env.MUSIC_RELAY_BASE_URL ?? DEFAULT_RELAY_BASE,
  ).trim();
  return url ? url.replace(/\/$/, "") : null;
}

export async function spotifyAccessToken(cfg: Record<string, unknown>): Promise<string | null> {
  const clientId = String(cfg.clientId ?? "").trim();
  const clientSecret = String(cfg.clientSecret ?? "").trim();
  const refreshToken = String(cfg.refreshToken ?? "").trim();
  if (!clientId || !clientSecret) return null;

  const body = refreshToken
    ? new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    : new URLSearchParams({ grant_type: "client_credentials" });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export function createMusicKitDeveloperToken(
  teamId: string,
  keyId: string,
  privateKeyP8: string
): string {
  let key = privateKeyP8.trim();
  if (!key.includes("BEGIN")) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: teamId, iat: now, exp: now + 15_777_000 })
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const signature = sign.sign({ key, format: "pem", type: "pkcs8" });
  const sig = signature.toString("base64url");
  return `${signingInput}.${sig}`;
}

export async function fetchRelayJson<T>(
  base: string,
  path: string,
  bearer?: string
): Promise<T | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const relayKey = process.env.MUSIC_RELAY_API_KEY?.trim();
  if (relayKey) headers["x-relay-api-key"] = relayKey;
  try {
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function resolveSpotifyRelayStream(
  cfg: Record<string, unknown>,
  trackId: string
): Promise<string | null> {
  const relay = musicRelayBase(cfg);
  if (!relay) return null;
  const token = await spotifyAccessToken(cfg);
  const data = await fetchRelayJson<{ url?: string }>(
    relay,
    `/spotify/track/${encodeURIComponent(trackId)}/stream`,
    token ?? undefined
  );
  return data?.url ?? null;
}

export async function resolveAppleRelayStream(
  cfg: Record<string, unknown>,
  songId: string
): Promise<string | null> {
  const relay = musicRelayBase(cfg);
  if (!relay) return null;
  const storefront = String(cfg.storefront ?? "us").trim() || "us";
  const data = await fetchRelayJson<{ url?: string }>(
    relay,
    `/apple-music/song/${encodeURIComponent(songId)}/stream?storefront=${encodeURIComponent(storefront)}`
  );
  return data?.url ?? null;
}

export async function resolveDeezerRelayStream(
  cfg: Record<string, unknown>,
  trackId: string
): Promise<string | null> {
  const relay = musicRelayBase(cfg);
  if (!relay) return null;
  const data = await fetchRelayJson<{ url?: string }>(
    relay,
    `/deezer/track/${encodeURIComponent(trackId)}/stream`
  );
  return data?.url ?? null;
}

export async function fetchDeezerRelayPlaylist(
  cfg: Record<string, unknown>,
  playlistId: string
): Promise<RelayTrack[]> {
  const relay = musicRelayBase(cfg);
  if (!relay) return [];
  const data = await fetchRelayJson<{ tracks?: RelayTrack[] }>(
    relay,
    `/deezer/playlist/${encodeURIComponent(playlistId)}/tracks`
  );
  return data?.tracks ?? [];
}

type RelayTrack = {
  id: string;
  name: string;
  streamUrl?: string | null;
  previewUrl?: string | null;
  image?: string | null;
};

export async function fetchSpotifyRelayPlaylist(
  cfg: Record<string, unknown>,
  playlistId: string
): Promise<RelayTrack[]> {
  const relay = musicRelayBase(cfg);
  if (!relay) return [];
  const token = await spotifyAccessToken(cfg);
  const data = await fetchRelayJson<{ tracks?: RelayTrack[] }>(
    relay,
    `/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`,
    token ?? undefined
  );
  return data?.tracks ?? [];
}

export async function fetchAppleMusicCatalogPlaylist(
  cfg: Record<string, unknown>,
  playlistId: string
): Promise<RelayTrack[]> {
  const relay = musicRelayBase(cfg);
  if (relay) {
    const storefront = String(cfg.storefront ?? "us").trim() || "us";
    const data = await fetchRelayJson<{ tracks?: RelayTrack[] }>(
      relay,
      `/apple-music/playlist/${encodeURIComponent(playlistId)}/tracks?storefront=${encodeURIComponent(storefront)}`
    );
    if (data?.tracks?.length) return data.tracks;
  }

  const teamId = String(cfg.teamId ?? "").trim();
  const keyId = String(cfg.keyId ?? "").trim();
  const privateKey = String(cfg.privateKey ?? "").trim();
  const storefront = String(cfg.storefront ?? "us").trim() || "us";
  if (!teamId || !keyId || !privateKey || !playlistId) return [];

  const token = createMusicKitDeveloperToken(teamId, keyId, privateKey);
  const res = await fetch(
    `https://api.music.apple.com/v1/catalog/${storefront}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: { id: string; attributes?: { name?: string; artwork?: { url?: string } } }[];
  };
  return (json.data ?? []).map((t) => ({
    id: t.id,
    name: t.attributes?.name ?? "Apple Music track",
    image: t.attributes?.artwork?.url?.replace("{w}x{h}", "300x300") ?? null,
  }));
}

export async function testSpotifyConnection(cfg: Record<string, unknown>): Promise<string> {
  const token = await spotifyAccessToken(cfg);
  if (!token) return "Spotify auth failed — check Client ID and Secret (and Refresh token for private playlists).";
  const relay = musicRelayBase(cfg);
  if (relay) {
    const probe = await fetch(`${relay}/health`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
    if (probe?.ok) return "Spotify + relay connected. Use Sync to import full streams.";
    return "Spotify API OK. Relay URL set but /health did not respond — sync may still work.";
  }
  return "Spotify API connected (preview mode). Music relay not reachable — check relay is running on port 8788.";
}

export async function testAppleMusicConnection(cfg: Record<string, unknown>): Promise<string> {
  const teamId = String(cfg.teamId ?? "").trim();
  const keyId = String(cfg.keyId ?? "").trim();
  const privateKey = String(cfg.privateKey ?? "").trim();
  if (!teamId || !keyId || !privateKey) {
    return "Missing Team ID, Key ID, or private key.";
  }
  const devToken = createMusicKitDeveloperToken(teamId, keyId, privateKey);
  const storefront = String(cfg.storefront ?? "us").trim() || "us";
  const res = await fetch(`https://api.music.apple.com/v1/catalog/${storefront}/search?term=test&types=songs&limit=1`, {
    headers: { Authorization: `Bearer ${devToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return `Apple Music API rejected token (HTTP ${res.status}). Check MusicKit key.`;
  const relay = musicRelayBase(cfg);
  if (relay) return "Apple Music API + relay configured. Use Sync to import playlists.";
  return "Apple Music API OK. Music relay not reachable — check relay is running on port 8788.";
}
