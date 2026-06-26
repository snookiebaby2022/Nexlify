"use client";

import { useEffect, useRef, useState } from "react";
import {
  canPlayRadioInBrowser,
  isRadioHlsUrl,
} from "@/lib/radio-playback";

type ProbeResult = {
  status: string;
  message: string;
  latencyMs?: number;
};

export function RadioProbePlayer({
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
  playFirst?: boolean;
}) {
  const mediaRef = useRef<HTMLAudioElement>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(Boolean(playFirst && canPlayRadioInBrowser(streamUrl)));
  const [playerError, setPlayerError] = useState("");

  async function resolveUrl(): Promise<string> {
    setResolving(true);
    try {
      const res = await fetch("/api/admin/streams/radio-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, url: streamUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Resolve failed");
      const url = String(data.playbackUrl ?? streamUrl);
      setPlaybackUrl(url);
      return url;
    } catch (e) {
      setPlaybackUrl(streamUrl);
      return streamUrl;
    } finally {
      setResolving(false);
    }
  }

  async function runProbe(fast = true) {
    setProbing(true);
    setProbe(null);
    setPlayerError("");
    const url = playbackUrl ?? (await resolveUrl());
    const res = await fetch("/api/admin/streams/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, url, fast }),
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
    if (!showPlayer) return;
    let cancelled = false;

    void (async () => {
      const url = await resolveUrl();
      if (cancelled || !mediaRef.current) return;
      const media = mediaRef.current;
      setPlayerError("");

      if (isRadioHlsUrl(url)) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
        script.async = true;
        script.onload = () => {
          if (cancelled) return;
          const Hls = (
            window as unknown as {
              Hls?: {
                isSupported: () => boolean;
                new (): {
                  loadSource: (u: string) => void;
                  attachMedia: (m: HTMLMediaElement) => void;
                  on: (e: string, cb: () => void) => void;
                };
              };
            }
          ).Hls;
          if (Hls?.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(media);
            hls.on("hlsError", () => setPlayerError("HLS playback failed (CORS or codec)"));
          } else if (media.canPlayType("application/vnd.apple.mpegurl")) {
            media.src = url;
          } else {
            setPlayerError("HLS not supported in this browser");
          }
        };
        document.body.appendChild(script);
        return () => {
          script.remove();
        };
      }

      media.src = url;
      void media.play().catch(() => {
        /* autoplay may be blocked until user interacts */
      });
    })();

    return () => {
      cancelled = true;
      if (mediaRef.current) {
        mediaRef.current.pause();
        mediaRef.current.removeAttribute("src");
        mediaRef.current.load();
      }
    };
  }, [showPlayer, streamUrl, streamId]);

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
      <p className="text-xs font-mono break-all" style={{ color: "var(--muted)" }}>
        {playbackUrl && playbackUrl !== streamUrl ? (
          <>
            <span>{playbackUrl}</span>
            <span className="block mt-1 opacity-70">Source: {streamUrl}</span>
          </>
        ) : (
          streamUrl
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={probing || resolving}
          onClick={() => void runProbe(true)}
          className="rounded px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {probing ? "Probing…" : "Quick probe"}
        </button>
        {canPlayRadioInBrowser(streamUrl) && (
          <button
            type="button"
            disabled={resolving}
            onClick={() => setShowPlayer((v) => !v)}
            className="rounded px-3 py-1.5 text-xs cursor-pointer border disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            {resolving ? "Loading…" : showPlayer ? "Stop" : "Listen"}
          </button>
        )}
        <a
          href={playbackUrl ?? streamUrl}
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
      {showPlayer && canPlayRadioInBrowser(streamUrl) && (
        <div className="space-y-2">
          <audio ref={mediaRef} controls className="w-full max-w-xl" />
          {playerError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {playerError}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Some stations block browser playback (CORS). Use Open URL in VLC if Listen fails.
          </p>
        </div>
      )}
    </div>
  );
}
