/** Client-safe bin path layout helpers (no Node fs imports). */

export const NEXLIFY_BIN_ROOT = "/home/nexlify/bin";

export type BinPathKey =
  | "binRoot"
  | "nginxPath"
  | "nginxRtmpPath"
  | "ffmpegPath"
  | "redisPath"
  | "phpPath"
  | "certbotPath"
  | "maxmindPath"
  | "daemonsSh";

export const BIN_PATH_LABELS: Record<BinPathKey, string> = {
  binRoot: "Bin root",
  nginxPath: "Nginx",
  nginxRtmpPath: "Nginx RTMP",
  ffmpegPath: "FFmpeg",
  redisPath: "Redis server",
  phpPath: "PHP CLI",
  certbotPath: "Certbot",
  maxmindPath: "MaxMind data",
  daemonsSh: "daemons.sh",
};

/** Rebuild paths under Nexlify bin root (same layout as legacy XUI installs). */
export function pathsFromBinRoot(binRoot: string = NEXLIFY_BIN_ROOT): Record<BinPathKey, string> {
  const root = binRoot.replace(/\/+$/, "") || NEXLIFY_BIN_ROOT;
  return {
    binRoot: root,
    nginxPath: `${root}/nginx/sbin/nginx`,
    nginxRtmpPath: `${root}/nginx_rtmp/sbin/nginx`,
    ffmpegPath: `${root}/ffmpeg_bin/ffmpeg`,
    redisPath: `${root}/redis/bin/redis-server`,
    phpPath: `${root}/php/bin/php`,
    certbotPath: `${root}/certbot/bin/certbot`,
    maxmindPath: `${root}/maxmind`,
    daemonsSh: `${root}/daemons.sh`,
  };
}

export const NEXLIFY_BIN_LAYOUT = pathsFromBinRoot(NEXLIFY_BIN_ROOT);

/** @deprecated Use NEXLIFY_BIN_LAYOUT */
export const XUI_BIN_LAYOUT = NEXLIFY_BIN_LAYOUT;
