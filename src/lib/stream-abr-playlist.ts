import { parseBitrates } from "@/lib/stream-variants";

export type AbrVariant = {
  name: string;
  bandwidth: number;
  path: string;
  resolution?: string;
};

/** Build HLS master playlist (#EXT-X-STREAM-INF) for multi-bitrate ladder. */
export function buildAbrMasterPlaylist(
  baseUrl: string,
  streamName: string,
  primaryUrl: string,
  bitrates: unknown
): string {
  const variants: AbrVariant[] = [];
  const primaryBw = 4_000_000;
  variants.push({
    name: "1080p",
    bandwidth: primaryBw,
    path: primaryUrl,
    resolution: "1920x1080",
  });

  for (const v of parseBitrates(bitrates)) {
    const bw = (Number(v.bandwidthKbps ?? 0) || 1500) * 1000;
    variants.push({
      name: v.label || `${Math.round(bw / 1000)}k`,
      bandwidth: bw,
      path: v.path,
      resolution: v.resolution,
    });
  }

  const lines = ["#EXTM3U", `#EXT-X-SESSION-DATA:DATA-ID="com.nexlify.title",VALUE="${streamName.replace(/"/g, "'")}"`];
  for (const v of variants) {
    const res = v.resolution ? `,RESOLUTION=${v.resolution}` : "";
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth}${res},NAME="${v.name}"`);
    lines.push(v.path.startsWith("http") ? v.path : `${baseUrl.replace(/\/$/, "")}/${v.path.replace(/^\//, "")}`);
  }
  return `${lines.join("\n")}\n`;
}
