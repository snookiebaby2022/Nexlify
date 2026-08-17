import { getSettingGroup } from "@/lib/panel-settings";
import type { PackagerTranscode } from "@/lib/ts-hls-packager";

export type LiveBandwidthSettings = {
  instantStart: boolean;
  saverEnabled: boolean;
  kbps: number;
  resolution: string;
  gpu: boolean;
};

export function isEcoProfileHint(hint: string | null | undefined): boolean {
  const h = String(hint ?? "").trim().toLowerCase();
  return h === "eco" || h === "low" || h === "lite" || h === "saver" || h === "bandwidth";
}

export async function getLiveBandwidthSettings(): Promise<LiveBandwidthSettings> {
  const s = await getSettingGroup("streams");
  const kbps = Math.max(350, Math.min(2500, Number(s.liveBandwidthSaverKbps ?? 1000) || 1000));
  const resolution = String(s.liveBandwidthSaverResolution ?? "854x480").trim() || "854x480";
  return {
    instantStart: s.liveInstantStart !== false,
    saverEnabled: s.liveBandwidthSaver !== false,
    kbps,
    resolution,
    gpu: s.liveBandwidthSaverGpu === true,
  };
}

export function ecoLiveProfile(settings: LiveBandwidthSettings): NonNullable<PackagerTranscode> {
  return {
    resolution: settings.resolution,
    bitrate: settings.kbps,
    codec: "h264",
    gpuAcceleration: settings.gpu,
  };
}

export const ECO_DISK_PROFILE = { id: "eco", name: "eco" } as const;

/**
 * When a master playlist has multiple renditions, keep only the lowest BANDWIDTH
 * so players do not pull 4–8 Mbps when a 800 kbps rung exists.
 */
export function pickLowestBandwidthHlsVariant(body: string): string {
  const lines = body.split(/\r?\n/);
  const variants: { bandwidth: number; inf: string; uri: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const inf = lines[i]!;
    if (!inf.trim().startsWith("#EXT-X-STREAM-INF:")) continue;
    const uri = lines[i + 1];
    if (!uri || uri.trim().startsWith("#") || !uri.trim()) continue;
    const bandwidth = Number(/BANDWIDTH=(\d+)/i.exec(inf)?.[1] ?? 0);
    variants.push({ bandwidth, inf, uri });
  }
  if (variants.length < 2) return body;

  variants.sort((a, b) => a.bandwidth - b.bandwidth || a.inf.length - b.inf.length);
  const best = variants[0]!;
  const skipUri = new Set(variants.map((v) => v.uri.trim()));
  const out: string[] = [];
  let skippingInf = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
      skippingInf = true;
      continue;
    }
    if (skippingInf) {
      skippingInf = false;
      continue;
    }
    if (skipUri.has(trimmed)) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  out.push(best.inf, best.uri, "");
  return out.join("\n");
}

export function liveTranscodeCodecArgs(profile: NonNullable<PackagerTranscode>): string[] {
  const vcodec =
    profile.gpuAcceleration && profile.codec !== "h265"
      ? "h264_nvenc"
      : profile.codec === "h265"
        ? "libx265"
        : "libx264";
  const videoKbps = Math.max(300, Number(profile.bitrate) || 1000);
  const audioKbps = videoKbps < 1500 ? 64 : 96;
  const tune = vcodec === "libx264" ? ["-tune", "zerolatency"] : [];
  return [
    "-c:v",
    vcodec,
    "-b:v",
    `${videoKbps}k`,
    "-maxrate",
    `${videoKbps}k`,
    "-bufsize",
    `${videoKbps * 2}k`,
    "-s",
    profile.resolution || "854x480",
    "-preset",
    "veryfast",
    ...tune,
    "-c:a",
    "aac",
    "-b:a",
    `${audioKbps}k`,
    "-ac",
    "2",
  ];
}
