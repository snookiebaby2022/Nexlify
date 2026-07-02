"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startWebRtcPlayback, type WebRtcPlayState } from "@/lib/webrtc-client";
import type { IceServerConfig } from "@/lib/webrtc-config";

type Props = {
  username: string;
  password: string;
  streamId: string;
  streamName?: string;
  fallbackHlsUrl?: string;
  autoPlay?: boolean;
  compact?: boolean;
};

export function WebRtcPlayer({
  username,
  password,
  streamId,
  streamName,
  fallbackHlsUrl,
  autoPlay = false,
  compact,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<Awaited<ReturnType<typeof startWebRtcPlayback>> | null>(null);
  const [state, setState] = useState<WebRtcPlayState>("idle");
  const [error, setError] = useState("");
  const [latencyHint, setLatencyHint] = useState("");
  const [iceServers, setIceServers] = useState<IceServerConfig[]>([]);

  useEffect(() => {
    fetch("/api/webrtc/ice")
      .then((r) => r.json())
      .then((d) => setIceServers(d.iceServers ?? []))
      .catch(() => setIceServers([{ urls: "stun:stun.l.google.com:19302" }]));
  }, []);

  const stop = useCallback(async () => {
    if (handleRef.current) {
      await handleRef.current.stop();
      handleRef.current = null;
    }
    setState("idle");
  }, []);

  const play = useCallback(async () => {
    if (!videoRef.current || !iceServers.length) return;
    setError("");
    await stop();

    try {
      const handle = await startWebRtcPlayback({
        username,
        password,
        streamId,
        video: videoRef.current,
        iceServers,
        onState: setState,
      });
      handleRef.current = handle;
      setLatencyHint("WebRTC · sub-second latency");
      await videoRef.current.play().catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("WEBRTC_FALLBACK:")) {
        const hls = msg.slice("WEBRTC_FALLBACK:".length);
        setError("WebRTC unavailable — use HLS fallback");
        if (videoRef.current) {
          videoRef.current.src = hls || fallbackHlsUrl || "";
          void videoRef.current.play().catch(() => {});
        }
        setState("playing");
        setLatencyHint("HLS fallback");
        return;
      }
      setError(msg);
      setState("failed");
    }
  }, [username, password, streamId, iceServers, stop, fallbackHlsUrl]);

  useEffect(() => {
    if (autoPlay && iceServers.length) void play();
    return () => {
      void stop();
    };
  }, [autoPlay, iceServers.length, streamId, play, stop]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div
        className="relative rounded-lg overflow-hidden bg-black aspect-video max-w-3xl"
        style={{ border: "1px solid var(--border)" }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          controls
          muted={autoPlay}
        />
        {state === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            Connecting WebRTC…
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {streamName && <span className="font-medium">{streamName}</span>}
        {latencyHint && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,192,239,0.2)", color: "#00c0ef" }}>
            {latencyHint}
          </span>
        )}
        <button
          type="button"
          onClick={() => void play()}
          disabled={state === "connecting"}
          className="px-3 py-1.5 rounded text-xs text-white"
          style={{ background: "var(--accent)" }}
        >
          {state === "playing" ? "Reconnect WebRTC" : "Play WebRTC"}
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          className="px-3 py-1.5 rounded text-xs border"
          style={{ borderColor: "var(--border)" }}
        >
          Stop
        </button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "#e74c3c" }}>
          {error}
        </p>
      )}
    </div>
  );
}
