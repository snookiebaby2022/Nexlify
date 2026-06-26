type SpotifyTrack = {
  id: string;
  name: string;
  previewUrl?: string | null;
  image?: string | null;
};

async function envSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN?.trim();
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
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function spotifyBearer(authorizationHeader?: string): Promise<string | null> {
  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice(7).trim() || null;
  }
  return envSpotifyToken();
}

export async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  bearer: string
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Spotify API ${res.status}`);
    const data = (await res.json()) as {
      items?: {
        track?: {
          id?: string;
          name?: string;
          preview_url?: string | null;
          album?: { images?: { url: string }[] };
        } | null;
      }[];
      next?: string | null;
    };
    for (const item of data.items ?? []) {
      const t = item.track;
      if (!t?.id || !t.name) continue;
      tracks.push({
        id: t.id,
        name: t.name,
        previewUrl: t.preview_url ?? null,
        image: t.album?.images?.[0]?.url ?? null,
      });
    }
    url = data.next ?? null;
  }
  return tracks;
}
