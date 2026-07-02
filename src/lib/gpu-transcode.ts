import type { FfmpegTranscodeProfile } from "@/lib/ffmpeg-transcode-profiles";
import { getSettingGroup } from "@/lib/panel-settings";
import { isPluginEntitled } from "@/lib/plugin-entitlement";

export type GpuEncoder = "nvenc" | "vaapi" | "qsv" | "cpu";

export type GpuTranscodeProfile = FfmpegTranscodeProfile & {
  gpuEncoder: GpuEncoder;
  hevc: boolean;
  ladderRank: number;
};

export const GPU_TRANSCODE_LADDER: GpuTranscodeProfile[] = [
  {
    id: "4k-hevc-nvenc",
    label: "4K HEVC (NVENC)",
    description: "4K H.265 ~15 Mbps — GPU",
    videoCodec: "hevc_nvenc",
    audioCodec: "aac",
    videoBitrateKbps: 15000,
    audioBitrateKbps: 256,
    resolution: "3840x2160",
    preset: "p4",
    hlsSegmentSec: 4,
    abrGroup: "uhd",
    gpuEncoder: "nvenc",
    hevc: true,
    ladderRank: 5,
  },
  {
    id: "1080p-nvenc",
    label: "1080p (NVENC)",
    description: "Full HD H.264 ~8 Mbps — GPU",
    videoCodec: "h264_nvenc",
    audioCodec: "aac",
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    resolution: "1920x1080",
    preset: "p4",
    hlsSegmentSec: 4,
    abrGroup: "hd",
    gpuEncoder: "nvenc",
    hevc: false,
    ladderRank: 4,
  },
  {
    id: "720p-qsv",
    label: "720p (QuickSync)",
    description: "HD ~4 Mbps — Intel QSV",
    videoCodec: "h264_qsv",
    audioCodec: "aac",
    videoBitrateKbps: 4000,
    audioBitrateKbps: 128,
    resolution: "1280x720",
    preset: "medium",
    hlsSegmentSec: 4,
    abrGroup: "hd",
    gpuEncoder: "qsv",
    hevc: false,
    ladderRank: 3,
  },
  {
    id: "480p-vaapi",
    label: "480p (VAAPI)",
    description: "SD ~2 Mbps — VAAPI",
    videoCodec: "h264_vaapi",
    audioCodec: "aac",
    videoBitrateKbps: 2000,
    audioBitrateKbps: 96,
    resolution: "854x480",
    preset: "medium",
    hlsSegmentSec: 4,
    abrGroup: "sd",
    gpuEncoder: "vaapi",
    hevc: false,
    ladderRank: 2,
  },
  {
    id: "360p-cpu-fallback",
    label: "360p CPU fallback",
    description: "Ultra-low ~1 Mbps — CPU libx264 when GPU unavailable",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 1000,
    audioBitrateKbps: 64,
    resolution: "640x360",
    preset: "ultrafast",
    hlsSegmentSec: 3,
    abrGroup: "sd",
    gpuEncoder: "cpu",
    hevc: false,
    ladderRank: 1,
  },
];

export async function getTranscodingPackSettings() {
  return getSettingGroup("transcoding-pack" as never);
}

export async function isTranscodingPackEnabled(panelHost?: string): Promise<boolean> {
  const entitled = await isPluginEntitled("transcoding_pro", panelHost);
  if (!entitled.ok) return false;
  const s = await getTranscodingPackSettings();
  return s.enabled === true;
}

export function pickAdaptiveProfile(
  profiles: GpuTranscodeProfile[],
  opts: { maxBandwidthKbps?: number; preferHevc?: boolean; gpuAvailable?: GpuEncoder[] }
): GpuTranscodeProfile {
  let pool = [...profiles].sort((a, b) => b.ladderRank - a.ladderRank);
  if (opts.preferHevc) {
    const hevc = pool.filter((p) => p.hevc);
    if (hevc.length) pool = hevc;
  }
  if (opts.gpuAvailable?.length) {
    const gpu = pool.filter((p) => opts.gpuAvailable!.includes(p.gpuEncoder) || p.gpuEncoder === "cpu");
    if (gpu.length) pool = gpu;
  }
  if (opts.maxBandwidthKbps != null && opts.maxBandwidthKbps > 0) {
    const fit = pool.filter((p) => p.videoBitrateKbps <= opts.maxBandwidthKbps!);
    if (fit.length) return fit[0];
    return pool[pool.length - 1] ?? profiles[0];
  }
  return pool[0] ?? profiles[0];
}

export function buildGpuFfmpegArgs(profile: GpuTranscodeProfile, inputUrl: string, device?: string): string[] {
  const hw = profile.gpuEncoder;
  const prefix: string[] = [];
  if (hw === "vaapi" && device) {
    prefix.push("-vaapi_device", device, "-vf", "format=nv12,hwupload", "-c:v", profile.videoCodec);
  } else if (hw === "nvenc") {
    prefix.push("-c:v", profile.videoCodec, "-preset", profile.preset);
  } else if (hw === "qsv") {
    prefix.push("-c:v", profile.videoCodec, "-preset", profile.preset);
  } else {
    prefix.push("-c:v", profile.videoCodec, "-preset", profile.preset);
  }
  const scale =
    profile.resolution !== "source" && hw === "cpu"
      ? ["-vf", `scale=${profile.resolution.replace("x", ":")}`]
      : [];
  return [
    "-i",
    inputUrl,
    ...prefix,
    "-b:v",
    `${profile.videoBitrateKbps}k`,
    "-maxrate",
    `${Math.round(profile.videoBitrateKbps * 1.1)}k`,
    ...scale,
    "-c:a",
    profile.audioCodec,
    "-b:a",
    `${profile.audioBitrateKbps}k`,
    "-f",
    "mpegts",
  ];
}

export function bitrateLadderForStream(baseProfileId: string): GpuTranscodeProfile[] {
  const base = GPU_TRANSCODE_LADDER.find((p) => p.id === baseProfileId);
  const rank = base?.ladderRank ?? 4;
  return GPU_TRANSCODE_LADDER.filter((p) => p.ladderRank <= rank).sort((a, b) => b.ladderRank - a.ladderRank);
}
