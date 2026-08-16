"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canPlayInBrowser } from "@/lib/stream-probe-fast";

type ProbeResult = {
  status: string;
  message: string;
  latencyMs?: number;
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

  const attachMedia = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPlayerError("");
    video.removeAttribute("src");
    video.load();

    if (url.includes(".m3u8")) {
      const HLS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
      const existing = document.querySelector(`script[src="${HLS_SRC}"]`);
      const script = (existing as HTMLScriptElement | null) ?? document.createElement("script");
      if (!existing) {
        script.src = HLS_SRC;
        script.async = true;
        document.body.appendChild(script);
      }
      script.onload = () => {
        const Hls = (
          window as unknown as {
            Hls?: {
              isSupported: () => boolean;
              new (): {
                loadSource: (u: string) => void;
                attachMedia: (v: HTMLVideoElement) => void;
                on: (e: string, cb: () => void) => void;
                destroy: () => void;
              };
            };
          }
        ).Hls;
        if (Hls?.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on("hlsError", () => setPlayerError("HLS playback failed (CORS or codec)"));
          void video.play().catch(() => undefined);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          void video.play().catch(() => undefined);
        } else {
          setPlayerError("HLS not supported in this browser");
        }
      };
      document.body.appendChild(script);
      return () => {
        if (!existing) script.remove();
      };
    }

    video.src = url;
    void video.play().catch(() => {
      /* autoplay may be blocked until user interacts */
    });
    return undefined;
  }, []);

  useEffect(() => {
    setResolvedUrl(streamUrl);
    setProbe(null);
    setShowPlayer(Boolean(playFirst && canPlayInBrowser(streamUrl)));
    setPlayerError("");
  }, [streamUrl, playFirst]);

  async function resolvePlaybackUrl(): Promise<string> {
    setResolving(true);
    try {
      const res = await fetch("/api/admin/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, url: streamUrl, fast: true }),
      });
      const data = await res.json();
      if (data.stream?.streamUrl) {
        const rawUrl = String(data.stream.streamUrl);
        // Use panel proxy for playback (handles TLS bypass for expired certs)
        const proxyUrl = `/api/admin/streams/proxy?url=${encodeURIComponent(rawUrl)}`;
        setResolvedUrl(proxyUrl);
        return proxyUrl;
      }
      return streamUrl;
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
      // Prefer panel proxy for browser playback (CORS / TLS).
      if (!url.includes("/api/admin/streams/proxy")) {
        const resolved = await resolvePlaybackUrl();
        if (cancelled) return;
        if (resolved) url = resolved;
      }
      cleanup = attachMedia(url);
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
    if (!playFirst) return;
    void runProbe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opening preview
  }, [playFirst, streamUrl, streamId]);

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
          Probe uses primary ABR variant and DNS rotator when configured.
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
        <p className="text-sm" style={{ color: statusColor }}>
          {probe.status.toUpperCase()}: {probe.message}
        </p>
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
