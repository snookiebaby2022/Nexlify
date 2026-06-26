import crypto from "node:crypto";

type AppleTrack = {
  id: string;
  name: string;
  image?: string | null;
};

function createMusicKitToken(): string | null {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MUSIC_KEY_ID?.trim();
  let key = process.env.APPLE_MUSIC_PRIVATE_KEY?.trim() ?? "";
  if (!teamId || !keyId || !key) return null;
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
  const sig = sign.sign({ key, format: "pem", type: "pkcs8" }).toString("base64url");
  return `${signingInput}.${sig}`;
}

export async function appleBearer(authorizationHeader?: string): Promise<string | null> {
  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice(7).trim() || null;
  }
  return createMusicKitToken();
}

export async function fetchApplePlaylistTracks(
  playlistId: string,
  storefront: string,
  bearer: string
): Promise<AppleTrack[]> {
  const sf = storefront.trim() || "us";
  const res = await fetch(
    `https://api.music.apple.com/v1/catalog/${sf}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) throw new Error(`Apple Music API ${res.status}`);
  const json = (await res.json()) as {
    data?: { id: string; attributes?: { name?: string; artwork?: { url?: string } } }[];
  };
  return (json.data ?? []).map((t) => ({
    id: t.id,
    name: t.attributes?.name ?? "Apple Music track",
    image: t.attributes?.artwork?.url?.replace("{w}x{h}", "300x300") ?? null,
  }));
}
