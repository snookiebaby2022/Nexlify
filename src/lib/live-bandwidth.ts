export type LiveBandwidthSettings = {
  enabled: boolean;
  targetBandwidthKbps?: number;
  instantStart: boolean;
  saverEnabled: boolean;
  forceUniversalMpegTs: boolean;
};

export const ECO_DISK_PROFILE = {
  name: "eco",
  resolution: "640x360",
  bitrate: 800,
  codec: "h264",
  gpuAcceleration: false,
};

export function ecoLiveProfile(_bw?: LiveBandwidthSettings | null) {
  return ECO_DISK_PROFILE;
}

export function getLiveBandwidthSettings(): LiveBandwidthSettings {
  return {
    enabled: false,
    instantStart: true,
    saverEnabled: false,
    forceUniversalMpegTs: false,
  };
}

export function isEcoProfileHint(hint: string | null | undefined): boolean {
  return (hint ?? "").toLowerCase() === "eco";
}

/** Keep the lowest-bandwidth variant in an HLS master playlist (bandwidth saver). */
export function pickLowestBandwidthHlsVariant(playlist: string): string {
  if (!playlist.includes("#EXT-X-STREAM-INF")) return playlist;
  const lines = playlist.split(/\r?\n/);
  let best: { bandwidth: number; inf: string; uri: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = bwMatch ? Number(bwMatch[1]) : Number.POSITIVE_INFINITY;
    const uri = (lines[i + 1] ?? "").trim();
    if (!uri || uri.startsWith("#")) continue;
    if (!best || bandwidth < best.bandwidth) best = { bandwidth, inf: line, uri };
  }
  if (!best) return playlist;
  const header = lines.filter(
    (l) =>
      l.startsWith("#EXTM3U") ||
      l.startsWith("#EXT-X-VERSION") ||
      l.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")
  );
  return [...header, best.inf, best.uri, ""].join("\n");
}
