import { probeStreamProvider, type ProbeResult } from "@/lib/stream-provider-probe";
import { binExists, getFfprobePath, runCommand } from "@/lib/bin-tools";
import { isLikelyDirectPlayUrl } from "@/lib/stream-probe-fast";

export type { ProbeResult };

/** Probe any stream URL (live, VOD, provider base). Server/API only. */
export async function probeStreamUrl(
  url: string,
  opts?: { fast?: boolean }
): Promise<ProbeResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { status: "offline", message: "URL is empty" };
  }

  const fast = opts?.fast === true;
  const http = await probeStreamProvider(trimmed, { fast });

  if (fast) {
    return http;
  }

  const media = await probeStreamWithFfprobe(trimmed);
  if (media) return media;

  return http;
}

async function probeStreamWithFfprobe(url: string): Promise<ProbeResult | null> {
  if (!isLikelyDirectPlayUrl(url)) return null;

  const ffprobe = await getFfprobePath();
  if (!(await binExists(ffprobe))) return null;

  try {
    const start = Date.now();
    const { stdout, stderr, code } = await runCommand(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name",
        "-of",
        "default=noprint_wrappers=1",
        "-timeout",
        "8000000",
        url,
      ],
      20_000
    );
    const latencyMs = Date.now() - start;
    const out = `${stdout}\n${stderr}`;

    if (code === 0 || out.includes("format_name=")) {
      const format = out.match(/format_name=(.+)/)?.[1]?.trim();
      return {
        status: "online",
        message: `Full probe (ffprobe)${format ? ` · ${format}` : ""} · ${latencyMs}ms`,
        latencyMs,
      };
    }

    const err = stderr.trim() || stdout.trim();
    if (err) {
      return {
        status: "degraded",
        message: `Full probe: ffprobe · ${err.slice(0, 160)}`,
        latencyMs,
      };
    }
  } catch (e) {
    return {
      status: "degraded",
      message: e instanceof Error ? e.message : "ffprobe failed",
    };
  }

  return null;
}
