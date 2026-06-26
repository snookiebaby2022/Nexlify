import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const YT_DLP = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
const SPOTDL = process.env.SPOTDL_PATH?.trim() || "spotdl";

export async function ytDlpDirectUrl(
  target: string,
  extraArgs: string[] = []
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      YT_DLP,
      ["-g", "--no-playlist", "--no-warnings", ...extraArgs, target],
      { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 }
    );
    const line = stdout.trim().split("\n").find(Boolean);
    return line ?? null;
  } catch {
    return null;
  }
}

export async function spotdlDirectUrl(spotifyUri: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(SPOTDL, ["url", spotifyUri], {
      timeout: 90_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const url = stdout.trim();
    return url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export async function resolveSpotifyStreamUrl(trackId: string): Promise<string | null> {
  const uri = `spotify:track:${trackId}`;
  const web = `https://open.spotify.com/track/${trackId}`;
  return (
    (await spotdlDirectUrl(uri)) ??
    (await ytDlpDirectUrl(web)) ??
    (await ytDlpDirectUrl(uri))
  );
}

export function appleMusicSongUrl(storefront: string, songId: string): string {
  const sf = storefront.trim() || "us";
  return `https://music.apple.com/${sf}/song/${songId}`;
}

export async function resolveAppleStreamUrl(
  storefront: string,
  songId: string
): Promise<string | null> {
  const url = appleMusicSongUrl(storefront, songId);
  return (await ytDlpDirectUrl(url)) ?? (await spotdlDirectUrl(url));
}

function deezerYtDlpArgs(): string[] {
  const arl = process.env.DEEZER_ARL?.trim();
  if (!arl) return [];
  return ["--add-header", `Cookie: arl=${arl}`];
}

export async function resolveDeezerStreamUrl(trackId: string): Promise<string | null> {
  const web = `https://www.deezer.com/track/${trackId}`;
  const args = deezerYtDlpArgs();
  return (await ytDlpDirectUrl(web, args)) ?? (await ytDlpDirectUrl(`deezer:track:${trackId}`, args));
}
