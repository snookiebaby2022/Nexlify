"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Open player immediately without waiting for probe */
  playFirst?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [showPlayer, setShowPlayer] = useState(Boolean(playFirst && canPlayInBrowser(streamUrl)));
  const [playerError, setPlayerError] = useState("");

  async function runProbe(fast = true) {
    setProbing(true);
    setProbe(null);
    setPlayerError("");
    const res = await fetch("/api/admin/streams/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, url: streamUrl, fast }),
    });
    const data = await res.json();
    setProbing(false);
    if (!res.ok) {
      setProbe({ status: "offline", message: data.error ?? "Probe failed" });
      return;
    }
    setProbe(data.probe);
  }

  useEffect(() => {
    if (!showPlayer || !videoRef.current) return;
    const video = videoRef.current;
    setPlayerError("");
    const url = streamUrl;

    if (url.includes(".m3u8")) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
      script.async = true;
      script.onload = () => {
        const Hls = (window as unknown as { Hls?: { isSupported: () => boolean; new (): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void; on: (e: string, cb: () => void) => void } } }).Hls;
        if (Hls?.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on("hlsError", () => setPlayerError("HLS playback failed (CORS or codec)"));
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
        } else {
          setPlayerError("HLS not supported in this browser");
        }
      };
      document.body.appendChild(script);
      return () => {
        script.remove();
      };
    }

    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [showPlayer, streamUrl]);

  const statusColor =
    probe?.status === "online"
      ? "var(--success)"
      : probe?.status === "degraded"
        ? "#fbbf24"
        : probe
          ? "var(--danger)"
          : "var(--muted)";

  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-lg border p-4"} style={compact ? undefined : { borderColor: "var(--border)", background: "var(--bg-card)" }}>
      {!compact && name && <p className="font-medium text-sm">{name}</p>}
      {streamId && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Probe uses primary ABR variant and DNS rotator when configured.
        </p>
      )}
      <p className="text-xs font-mono break-all" style={{ color: "var(--muted)" }}>
        {streamUrl}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={probing}
          onClick={() => runProbe(true)}
          className="rounded px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {probing ? "Probing…" : "Quick probe"}
        </button>
        <button
          type="button"
          disabled={probing}
          onClick={() => runProbe(false)}
          className="rounded px-3 py-1.5 text-xs cursor-pointer border disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          Full probe
        </button>
        {canPlayInBrowser(streamUrl) && (
          <button
            type="button"
            onClick={() => setShowPlayer((v) => !v)}
            className="rounded px-3 py-1.5 text-xs cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
          >
            {showPlayer ? "Hide player" : "Play in browser"}
          </button>
        )}
        <a
          href={streamUrl}
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
      {showPlayer && canPlayInBrowser(streamUrl) && (
        <div className="space-y-2">
          <video ref={videoRef} controls className="w-full max-w-xl rounded bg-black max-h-64" />
          {playerError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {playerError}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Live .ts or blocked URLs may not play in-browser; use Probe + VLC if needed.
          </p>
        </div>
      )}
    </div>
  );
}
