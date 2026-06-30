export type FfmpegTranscodeProfile = {
  id: string;
  label: string;
  description: string;
  videoCodec: string;
  audioCodec: string;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  resolution: string;
  preset: string;
  hlsSegmentSec: number;
  abrGroup?: string;
};

/** Standard adaptive / multi-bitrate FFmpeg profiles for live edges. */
export const FFMPEG_TRANSCODE_PROFILES: FfmpegTranscodeProfile[] = [
  {
    id: "copy",
    label: "Direct copy",
    description: "No transcode — lowest CPU, source quality",
    videoCodec: "copy",
    audioCodec: "copy",
    videoBitrateKbps: 0,
    audioBitrateKbps: 0,
    resolution: "source",
    preset: "none",
    hlsSegmentSec: 4,
  },
  {
    id: "1080p-hq",
    label: "1080p HQ",
    description: "Full HD H.264 ~8 Mbps",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    resolution: "1920x1080",
    preset: "veryfast",
    hlsSegmentSec: 4,
    abrGroup: "hd",
  },
  {
    id: "1080p50",
    label: "1080p50 sports",
    description: "Full HD 50fps — sports / fast motion",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 10000,
    audioBitrateKbps: 192,
    resolution: "1920x1080",
    preset: "veryfast",
    hlsSegmentSec: 3,
    abrGroup: "hd",
  },
  {
    id: "720p",
    label: "720p",
    description: "HD H.264 ~4 Mbps — good mobile/tablet",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 4000,
    audioBitrateKbps: 128,
    resolution: "1280x720",
    preset: "veryfast",
    hlsSegmentSec: 4,
    abrGroup: "hd",
  },
  {
    id: "576p",
    label: "576p PAL",
    description: "PAL SD ~2.5 Mbps",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 2500,
    audioBitrateKbps: 128,
    resolution: "1024x576",
    preset: "veryfast",
    hlsSegmentSec: 4,
    abrGroup: "sd",
  },
  {
    id: "480p",
    label: "480p",
    description: "SD H.264 ~2 Mbps — low bandwidth",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 2000,
    audioBitrateKbps: 96,
    resolution: "854x480",
    preset: "veryfast",
    hlsSegmentSec: 4,
    abrGroup: "sd",
  },
  {
    id: "360p-mobile",
    label: "360p mobile",
    description: "Ultra-low bandwidth ~1 Mbps",
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrateKbps: 1000,
    audioBitrateKbps: 64,
    resolution: "640x360",
    preset: "ultrafast",
    hlsSegmentSec: 3,
    abrGroup: "sd",
  },
];

export function getFfmpegProfile(id: string): FfmpegTranscodeProfile | undefined {
  return FFMPEG_TRANSCODE_PROFILES.find((p) => p.id === id);
}

export function buildFfmpegTranscodeArgs(profile: FfmpegTranscodeProfile, inputUrl: string): string[] {
  if (profile.videoCodec === "copy") {
    return ["-i", inputUrl, "-c", "copy", "-f", "mpegts"];
  }
  const scale =
    profile.resolution !== "source"
      ? ["-vf", `scale=${profile.resolution.replace("x", ":")}`]
      : [];
  return [
    "-i",
    inputUrl,
    "-c:v",
    profile.videoCodec,
    "-b:v",
    `${profile.videoBitrateKbps}k`,
    "-maxrate",
    `${Math.round(profile.videoBitrateKbps * 1.1)}k`,
    "-bufsize",
    `${profile.videoBitrateKbps * 2}k`,
    ...scale,
    "-c:a",
    profile.audioCodec,
    "-b:a",
    `${profile.audioBitrateKbps}k`,
    "-preset",
    profile.preset,
    "-f",
    "mpegts",
  ];
}
