export type LiveTranscodeProfile = {
  name?: string;
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
};

function scaleFilter(resolution: string): string[] {
  const m = /^(\d+)x(\d+)$/i.exec(resolution.trim());
  if (!m) return [];
  return [
    "-vf",
    `scale=${m[1]}:${m[2]}:force_original_aspect_ratio=decrease,pad=${m[1]}:${m[2]}:(ow-iw)/2:(oh-ih)/2`,
  ];
}

function videoCodecArgs(profile: LiveTranscodeProfile): string[] {
  const bitrateK = Math.max(200, Math.round(profile.bitrate));
  const codec = (profile.codec || "h264").toLowerCase();
  if (profile.gpuAcceleration && (codec === "h264" || codec === "avc" || codec === "x264")) {
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p4",
      "-b:v",
      `${bitrateK}k`,
      "-maxrate",
      `${bitrateK}k`,
      "-bufsize",
      `${bitrateK * 2}k`,
    ];
  }
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-b:v",
    `${bitrateK}k`,
    "-maxrate",
    `${bitrateK}k`,
    "-bufsize",
    `${bitrateK * 2}k`,
  ];
}

/** ffmpeg codec args for live HLS packaging or MPEG-TS remux. Caller supplies the muxer (-f). */
export function liveTranscodeCodecArgs(
  profile?: LiveTranscodeProfile | string | null
): string[] {
  if (!profile) return [];
  if (typeof profile === "string") {
    return ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-c:a", "aac", "-b:a", "128k", "-ac", "2"];
  }
  return [
    ...scaleFilter(profile.resolution),
    ...videoCodecArgs(profile),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
  ];
}

export function universalMpegTsTranscodeArgs(): string[] {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-f",
    "mpegts",
  ];
}
