import { hlsDaemonOrigin, hlsDaemonToken } from "@/lib/hls-disk";
import type { TranscodingProfile } from "@/lib/transcoding-profiles";

export type HlsEnsureOpts = {
  streamId: string;
  upstreamUrl: string;
  userAgent?: string;
  loop?: boolean;
  transcode?: Pick<TranscodingProfile, "resolution" | "bitrate" | "codec" | "gpuAcceleration"> | null;
  vod?: boolean;
};

export type HlsEnsureResult =
  | { ok: true; playlist: string; via: "daemon" | "local" }
  | { ok: false; error: string };

export async function isHlsDaemonHealthy(): Promise<boolean> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 800);
  try {
    const res = await fetch(`${hlsDaemonOrigin()}/health`, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function daemonEnsure(opts: HlsEnsureOpts): Promise<HlsEnsureResult | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 18_000);
  try {
    const res = await fetch(`${hlsDaemonOrigin()}/ensure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hlsDaemonToken()}`,
      },
      body: JSON.stringify(opts),
      signal: ac.signal,
    });
    if (!res.ok) {
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) return { ok: false, error: data.error };
      } catch {
        /* ignore */
      }
      return { ok: false, error: `HLS daemon HTTP ${res.status}` };
    }
    const data = (await res.json()) as { ok?: boolean; playlist?: string; error?: string };
    if (data.ok && data.playlist) return { ok: true, playlist: data.playlist, via: "daemon" };
    return { ok: false, error: data.error || "HLS daemon returned empty playlist" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Prefer the HLS daemon (ffmpeg outside Next). If the daemon is healthy, never
 * spawn ffmpeg inside Next — that path OOM-restarts the panel under MPEGTS+HLS load.
 */
export async function ensureDiskHls(opts: HlsEnsureOpts): Promise<HlsEnsureResult> {
  const remote = await daemonEnsure(opts);
  if (remote) return remote;
  if (await isHlsDaemonHealthy()) {
    return { ok: false, error: "HLS daemon is up but /ensure failed (check PANEL_INTERNAL_SECRET)" };
  }
  const { ensureTsHlsPackager } = await import("@/lib/ts-hls-packager");
  const packed = await ensureTsHlsPackager({
    upstreamUrl: opts.upstreamUrl,
    lineId: "daemon",
    streamId: opts.streamId,
    userAgent: opts.userAgent,
    loop: opts.loop,
    transcode: opts.transcode ?? null,
    vod: opts.vod,
  });
  if (!packed.ok) return packed;
  return { ok: true, playlist: packed.playlist, via: "local" };
}
