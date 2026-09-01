"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachUrlToVideo } from "@/lib/browser-stream-player";
import { canPlayInBrowser, isBrowserHlsUrl } from "@/lib/stream-probe-fast";

type ProbeResult = {
  status: string;
  message: string;
  latencyMs?: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  format?: string;
};

export function StreamProbePlayer({
  streamId,
  streamUrl,
  name,
  compact,
  playFirst,
}: {
  streamId?: string;
  streamUrl: string;
  name?: string;
  compact?: boolean;
  /** Open player immediately and attempt playback (video log style) */
  playFirst?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(streamUrl);
  const [showPlayer, setShowPlayer] = useState(Boolean(playFirst && canPlayInBrowser(streamUrl)));
  const [playerError, setPlayerError] = useState("");

  const attachMedia = useCallback(async (url: string) => {
    const video = videoRef.current;
    if (!video) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPlayerError("");

    const handle = await attachUrlToVideo(video, url, (msg) => setPlayerError(msg));
    hlsRef.current = handle;
    return () => handle.destroy();
  }, []);

  const probedOnErrorRef = useRef(false);

  useEffect(() => {
    setResolvedUrl(streamUrl);
    setProbe(null);
    setShowPlayer(Boolean(playFirst && canPlayInBrowser(streamUrl)));
    setPlayerError("");
    probedOnErrorRef.current = false;
  }, [streamUrl, playFirst]);

  async function resolvePlaybackUrl(): Promise<string> {
    setResolving(true);
    try {
      const mint = await fetch("/api/admin/streams/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: streamUrl,
          hls: isBrowserHlsUrl(streamUrl) || (!streamUrl.includes(".ts") && /^https?:\/\//i.test(streamUrl)),
        }),
      });
      const minted = (await mint.json().catch(() => null)) as { playbackUrl?: string } | null;
      const proxyUrl = mint.ok && minted?.playbackUrl ? minted.playbackUrl : streamUrl;
      setResolvedUrl(proxyUrl);
      return proxyUrl;
    } catch {
      return streamUrl;
    } finally {
      setResolving(false);
    }
  }

  async function runProbe(fast = true) {
    setProbing(true);
    setProbe(null);
    setPlayerError("");
    try {
      const res = await fetch("/api/admin/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, url: streamUrl, fast }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProbe({ status: "offline", message: data.error ?? "Probe failed" });
        return;
      }
      if (data.stream?.streamUrl) setResolvedUrl(String(data.stream.streamUrl));
      setProbe(data.probe);
    } catch {
      setProbe({ status: "offline", message: "Network error — could not reach probe endpoint" });
    } finally {
      setProbing(false);
    }
  }

  useEffect(() => {
    if (!showPlayer) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      let url = resolvedUrl || streamUrl;
      if (!url.includes("/api/admin/streams/proxy?")) {
        const resolved = await resolvePlaybackUrl();
        if (cancelled) return;
        if (resolved) url = resolved;
      }
      const teardown = await attachMedia(url);
      if (!cancelled && teardown) cleanup = teardown;
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach when player opens / URL changes
  }, [showPlayer, resolvedUrl, streamUrl, streamId, attachMedia]);

  useEffect(() => {
    if (!playerError || probedOnErrorRef.current) return;
    const msg = playerError.toLowerCase();
    if (msg.includes("click play to start") || msg.includes("retrying") || msg.includes("recovering")) {
      return;
    }
    probedOnErrorRef.current = true;
    void runProbe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once when in-browser play fails
  }, [playerError]);

  const displayUrl = resolvedUrl || streamUrl;
  const canPlay = canPlayInBrowser(displayUrl);
  const statusColor =
    probe?.status === "online"
      ? "var(--success)"
      : probe?.status === "degraded"
        ? "#fbbf24"
        : probe
          ? "var(--danger)"
          : "var(--muted)";

  return (
    <div
      className={compact ? "space-y-2" : "space-y-3 rounded-lg border p-4"}
      style={compact ? undefined : { borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      {!compact && name && <p className="font-medium text-sm">{name}</p>}
      {streamId && !compact && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Playback starts when you open a channel. A source probe runs only if play fails, or if you click Check.
        </p>
      )}
      <p className="text-xs font-mono break-all" style={{ color: "var(--muted)" }}>
        {displayUrl}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={probing || resolving}
          onClick={() => void runProbe(true)}
          className="rounded px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {probing ? "Checking…" : compact ? "Check source" : "Quick probe"}
        </button>
        {!compact && (
          <button
            type="button"
            disabled={probing || resolving}
            onClick={() => void runProbe(false)}
            className="rounded px-3 py-1.5 text-xs cursor-pointer border disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Full probe
          </button>
        )}
        {compact && (
          <button
            type="button"
            disabled={probing || resolving}
            onClick={() => void runProbe(false)}
            className="rounded px-3 py-1.5 text-xs cursor-pointer border disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Full check
          </button>
        )}
        {canPlay && (
          <button
            type="button"
            disabled={resolving}
            onClick={() => {
              void (async () => {
                if (showPlayer) {
                  setShowPlayer(false);
                  return;
                }
                // Always play through panel proxy to avoid CORS / TLS issues in-browser.
                const proxied = await resolvePlaybackUrl();
                if (proxied) setResolvedUrl(proxied);
                setShowPlayer(true);
              })();
            }}
            className="rounded px-3 py-1.5 text-xs cursor-pointer border disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            {resolving ? "Loading…" : showPlayer ? "Stop" : playFirst ? "Play" : "Play in browser"}
          </button>
        )}
        <a
          href={displayUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded px-3 py-1.5 text-xs border inline-block"
          style={{ borderColor: "var(--border)" }}
        >
          Open URL
        </a>
      </div>
      {probe && (
        <div className="space-y-1">
          <p className="text-sm" style={{ color: statusColor }}>
            {probe.status.toUpperCase()}: {probe.message}
          </p>
          {(probe.videoCodec || probe.audioCodec || probe.resolution) && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {[
                probe.format,
                probe.videoCodec,
                probe.resolution,
                probe.fps ? `${probe.fps} fps` : null,
                probe.audioCodec,
                probe.bitrateKbps ? `${probe.bitrateKbps} kbps` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
      {showPlayer && canPlay && (
        <div className="space-y-2">
          <video ref={videoRef} controls className="w-full max-w-xl rounded bg-black max-h-64" playsInline />
          {playerError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {playerError}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Live .ts or blocked URLs may not play in-browser; use Probe + Open URL in VLC if needed.
          </p>
        </div>
      )}
    </div>
  );
}
