/** Shared live transcode profile — kept out of ts-hls-packager to avoid circular imports. */
export type LiveTranscodeProfile = {
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
};

export function universalMpegTsTranscodeArgs(): string[] {
  return [
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
  ];
}

export function liveTranscodeCodecArgs(profile: LiveTranscodeProfile): string[] {
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
