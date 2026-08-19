import type { LiveTranscodeProfile } from "@/lib/live-transcode";

const DAEMON_URL = process.env.HLS_DAEMON_URL || "http://127.0.0.1:13081";
const PANEL_INTERNAL_SECRET = process.env.PANEL_INTERNAL_SECRET || "";

export async function isHlsDaemonHealthy(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    return (await fetch(`${DAEMON_URL}/health`, { signal: controller.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function callDaemonEnsure(opts: {
  streamId: string;
  upstreamUrl: string;
  userAgent?: string;
  loop?: boolean;
  transcode?: unknown;
  vod?: boolean;
}): Promise<{ ok: boolean; playlist?: string; via?: string; error?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const res = await fetch(`${DAEMON_URL}/ensure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PANEL_INTERNAL_SECRET}`,
      },
      body: JSON.stringify(opts),
      signal: controller.signal,
    });
    if (!res.ok) {
      try {
        const body = await res.json();
        if (body?.error) return { ok: false, error: body.error };
      } catch {}
      return { ok: false, error: `HLS daemon HTTP ${res.status}` };
    }
    const body = await res.json();
    if (body.ok && body.playlist) return { ok: true, playlist: body.playlist, via: "daemon" };
    return { ok: false, error: body.error || "HLS daemon returned empty playlist" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureDiskHls(opts: {
  streamId: string;
  upstreamUrl: string;
  userAgent?: string;
  loop?: boolean;
  transcode?: LiveTranscodeProfile | string | null;
  vod?: boolean;
}): Promise<{ ok: true; playlist: string; via?: string } | { ok: false; error: string }> {
  const daemonResult = await callDaemonEnsure(opts);
  if (daemonResult) {
    if (daemonResult.ok && daemonResult.playlist) {
      return { ok: true, playlist: daemonResult.playlist, via: daemonResult.via };
    }
    return { ok: false, error: daemonResult.error || "HLS daemon returned empty playlist" };
  }

  if (await isHlsDaemonHealthy()) {
    return { ok: false, error: "HLS daemon is up but /ensure failed (check PANEL_INTERNAL_SECRET)" };
  }
  const { ensureTsHlsPackager } = await import("@/lib/ts-hls-packager");
  const local = await ensureTsHlsPackager({
    upstreamUrl: opts.upstreamUrl,
    lineId: "daemon",
    streamId: opts.streamId,
    userAgent: opts.userAgent,
    loop: opts.loop,
    transcode: typeof opts.transcode === "string" ? null : opts.transcode ?? null,
    vod: opts.vod,
  });
  return local.ok ? { ok: true, playlist: local.playlist, via: "local" } : local;
}

export async function openDaemonMpegTs(opts: {
  streamId: string;
  upstreamUrl: string;
  lineId: string;
  clientIp?: string;
  userAgent?: string;
  hls?: boolean;
  forceUniversal?: boolean;
  transcode?: unknown;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; body: ReadableStream<Uint8Array>; contentType: string }
  | { ok: false; error: string }
  | null
> {
  try {
    const res = await fetch(`${DAEMON_URL}/mpegts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${PANEL_INTERNAL_SECRET}` },
      body: JSON.stringify({
        streamId: opts.streamId,
        upstreamUrl: opts.upstreamUrl,
        lineId: opts.lineId,
        clientIp: opts.clientIp ?? "",
        userAgent: opts.userAgent,
        hls: !!opts.hls,
        forceUniversal: !!opts.forceUniversal,
        transcode: opts.transcode ?? null,
      }),
      signal: opts.signal,
    });
    if (!res.ok) {
      let err = `MPEGTS daemon HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) err = body.error;
      } catch {}
      return { ok: false, error: err };
    }
    if (!res.body) return { ok: false, error: "MPEGTS daemon returned empty body" };
    return {
      ok: true,
      body: res.body as ReadableStream<Uint8Array>,
      contentType: res.headers.get("content-type") || "video/mp2t",
    };
  } catch (e) {
    if (opts.signal?.aborted) return { ok: false, error: "aborted" };
    return null;
  }
}
