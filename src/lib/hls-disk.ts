import { existsSync, mkdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/** XUI/NXT-style on-disk HLS root. Nginx aliases /hls/ here; ffmpeg writes outside Next. */
export function hlsDiskRoot(): string {
  const env = (process.env.NEXLIFY_HLS_DIR ?? "").trim();
  const candidates = [env, "/var/lib/nexlify/hls", "/var/www/nexlify-hls", join(tmpdir(), "nexlify-hls")].filter(
    Boolean
  );
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      if (existsSync(dir)) return dir;
    } catch {
      /* try next */
    }
  }
  return join(tmpdir(), "nexlify-hls");
}

export function hlsStreamDir(streamId: string): string {
  const safe = String(streamId).replace(/[^a-zA-Z0-9_-]/g, "");
  return join(hlsDiskRoot(), safe || "unknown");
}

/** Absolute path to an on-disk index.m3u8 if the packager/daemon already produced one. */
export function localHlsIndexPath(streamId: string): string | null {
  const dir = hlsStreamDir(streamId);
  const indexPath = join(dir, "index.m3u8");
  try {
    if (existsSync(indexPath) && statSync(indexPath).size > 24) return indexPath;
  } catch {
    /* ignore */
  }
  return null;
}

export const HLS_DAEMON_HOST = "127.0.0.1";
export const HLS_DAEMON_PORT = Number(process.env.NEXLIFY_HLS_DAEMON_PORT || 13081);

export function hlsDaemonOrigin(): string {
  return `http://${HLS_DAEMON_HOST}:${HLS_DAEMON_PORT}`;
}

export function hlsDaemonToken(): string {
  return (
    process.env.PANEL_INTERNAL_SECRET ||
    process.env.NEXLIFY_PANEL_API_SECRET ||
    process.env.JWT_SECRET ||
    "nexlify-hls-local"
  );
}
