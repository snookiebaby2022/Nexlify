/** How this panel host delivers /live/ — scripts and apply must branch on this, not hostname. */

export const PLAYBACK_TOPOLOGIES = [
  "local-edge",
  "remote-splice",
  "multi-lb",
  "classic-lb",
] as const;
export type PlaybackTopology = (typeof PLAYBACK_TOPOLOGIES)[number];

export function parsePlaybackTopology(raw: unknown): PlaybackTopology | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!t) return null;
  if (t === "a" || t === "local" || t === "local-edge" || t === "panel-edge") return "local-edge";
  if (
    t === "b" ||
    t === "remote" ||
    t === "remote-splice" ||
    t === "remote-edge" ||
    t === "split" ||
    t === "panel-only"
  ) {
    return "remote-splice";
  }
  if (t === "c" || t === "multi-lb" || t === "lb" || t === "multi-server") return "multi-lb";
  if (
    t === "d" ||
    t === "classic-lb" ||
    t === "ffmpeg-lb" ||
    t === "xui-lb" ||
    t === "nginx-ffmpeg"
  ) {
    return "classic-lb";
  }
  return null;
}

/** Topologies where the Main panel must not run nexlify-iptv-edge or own media bitrate. */
export function panelMustNotRunLocalIptvEdge(topology: PlaybackTopology): boolean {
  return topology === "remote-splice" || topology === "multi-lb" || topology === "classic-lb";
}

/** Classic LB = nginx/PHP + FFmpeg restream (XUI-style data plane). */
export function isClassicLbTopology(topology: PlaybackTopology): boolean {
  return topology === "classic-lb";
}
