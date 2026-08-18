export function liveTranscodeCodecArgs(profile?: string | null): string[] {
  if (!profile) return [];
  return ["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac"];
}

export function universalMpegTsTranscodeArgs(): string[] {
  return ["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-f", "mpegts"];
}
