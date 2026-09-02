import { probeStreamProvider, type ProbeResult, type ProviderProbeOptions } from "@/lib/stream-provider-probe";
import { getFfprobePath, runCommand } from "@/lib/bin-tools";
import { formatFfprobeSummary, parseFfprobeJson } from "@/lib/ffprobe-media";
import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";
import { repairMalformedStreamUrl } from "@/lib/stream-source";

export type { ProbeResult };

const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";

async function resolveForProbe(url: string): Promise<{ target: string; hint?: string }> {
  const trimmed = repairMalformedStreamUrl(url.trim());
  if (!trimmed) return { target: "" };
  if (isIntegrationStreamUrl(trimmed)) {
    const resolved = await resolveIntegrationPlaybackUrl(trimmed);
    if (resolved) return { target: resolved, hint: "integration" };
    return {
      target: trimmed,
      hint: "Integration stream — could not resolve playback URL (check Plex/Emby config)",
    };
  }
  return { target: trimmed };
}

/** Probe any stream URL (live, VOD, provider base). Server/API only. */
export async function probeStreamUrl(
  url: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { status: "offline", message: "URL is empty", failureReason: "error" };
  }

  const { target, hint } = await resolveForProbe(trimmed);
  if (!target) {
    return { status: "offline", message: "URL is empty", failureReason: "error" };
  }
  if (hint && !/^https?:\/\//i.test(target)) {
    return { status: "offline", message: hint, failureReason: "error" };
  }

  const fast = opts?.fast === true;
  let last: ProbeResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const http = await probeStreamProvider(target, {
      ...opts,
      fast,
      skipCache: attempt > 0 ? true : opts?.skipCache,
    });
    if (http.status === "online" || http.status === "degraded") {
      if (hint && http.status !== "offline") {
        return {
          ...http,
          message: http.message.includes("integration") ? http.message : `${http.message} · ${hint}`,
        };
      }
      if (fast || attempt > 0) return http;
      const media = await probeStreamWithFfprobe(target);
      if (media) return media;
      return http;
    }
    last = http;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }

  const failed = last ?? { status: "offline" as const, message: "Probe failed" };
  if (hint) {
    return {
      ...failed,
      message: failed.message.includes("integration") ? failed.message : `${failed.message} · ${hint}`,
    };
  }
  return failed;
}

async function probeStreamWithFfprobe(url: string): Promise<ProbeResult | null> {
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return null;

  const ffprobe = await getFfprobePath();
  const isRemote = /^https?:\/\//i.test(url);
  const args = [
    "-v",
    "error",
    "-hide_banner",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-analyzeduration",
    "2000000",
    "-probesize",
    "2000000",
  ];
  if (isRemote) {
    args.push("-user_agent", UPSTREAM_UA, "-timeout", "8000000");
  }
  args.push(url);

  try {
    const start = Date.now();
    const { stdout, stderr, code } = await runCommand(ffprobe, args, 18_000);
    const latencyMs = Date.now() - start;
    const info = parseFfprobeJson(stdout);
    if (info) {
      const summary = formatFfprobeSummary(info);
      return {
        status: "online",
        message: `ffprobe${summary ? ` · ${summary}` : ""} · ${latencyMs}ms`,
        latencyMs,
        videoCodec: info.videoCodec,
        audioCodec: info.audioCodec,
        resolution: info.resolution,
        fps: info.fps,
        bitrateKbps: info.bitrateKbps,
        durationSec: info.durationSec,
        format: info.format,
      };
    }

    const err = stderr.trim() || stdout.trim();
    if (code !== 0 && err) {
      return {
        status: "degraded",
        message: `ffprobe · ${err.slice(0, 180)}`,
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
