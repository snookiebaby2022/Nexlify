import { binExists, getFfprobePath, getFfmpegPath, runCommand } from "@/lib/bin-tools";

export type MediaProbeResult = {
  durationSec?: number;
  format?: string;
  probed: boolean;
  error?: string;
};

function parseDuration(stderr: string): number | undefined {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

/** Probe a local file with ffprobe/ffmpeg from panel binaries settings. */
export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  const ffprobe = await getFfprobePath();
  const ffmpeg = await getFfmpegPath();
  if (!(await binExists(ffprobe)) && !(await binExists(ffmpeg))) {
    return { probed: false, error: "FFmpeg/ffprobe not found (check Settings → Server binaries)" };
  }

  try {
    if (await binExists(ffprobe)) {
      const { stdout, code } = await runCommand(ffprobe, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        filePath,
      ]);
      if (code === 0 && stdout) {
        const j = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string } };
        return {
          probed: true,
          durationSec: j.format?.duration ? parseFloat(j.format.duration) : undefined,
          format: j.format?.format_name,
        };
      }
    }

    const { stderr } = await runCommand(ffmpeg, ["-hide_banner", "-i", filePath]);
    return {
      probed: true,
      durationSec: parseDuration(stderr),
      format: stderr.match(/Input #0,\s*([^,]+)/)?.[1]?.trim(),
    };
  } catch (e) {
    return { probed: false, error: e instanceof Error ? e.message : "Probe failed" };
  }
}
