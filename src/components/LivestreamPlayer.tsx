"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const HLS_1080 = "https://nexlify.live/hls/nexlify.m3u8";
const HLS_720 = "https://nexlify.live/hls/nexlify-720.m3u8";
const QUALITY_KEY = "nexlify-livestream-quality";
const VOLUME_KEY = "nexlify-livestream-volume";
const VIEWER_KEY = "nexlify-livestream-viewer-id";
const STATUS_POLL_MS = 15_000;

type Quality = "1080" | "720";
type PlayerState = "loading" | "live" | "offline";

type LivestreamPlayerProps = {
  hlsUrl: string;
  hls720Url: string;
  title: string;
};

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitExitFullscreen?: () => void;
};

function isFullscreenActive(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
  );
}

function readQuality(): Quality {
  if (typeof window === "undefined") return "1080";
  return window.localStorage.getItem(QUALITY_KEY) === "720" ? "720" : "1080";
}

function readVolume(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (raw === null) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getViewerId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(VIEWER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(VIEWER_KEY, id);
  }
  return id;
}

function formatViewerCount(count: number): string {
  if (count === 1) return "1 watching";
  return `${count.toLocaleString()} watching`;
}

const controlBar: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.75rem 1rem",
  background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
};

const iconBtn: CSSProperties = {
  width: "2.5rem",
  height: "2.5rem",
  display: "grid",
  placeItems: "center",
  borderRadius: "9999px",
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  cursor: "pointer",
};

const volumeSlider: CSSProperties = {
  width: "5.5rem",
  height: "0.25rem",
  accentColor: "#fff",
  cursor: "pointer",
};

async function fetchStreamStatus(viewerId: string): Promise<{ live: boolean; live720: boolean; viewers: number }> {
  try {
    const qs = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const res = await fetch(`/api/livestream/status${qs}`, { cache: "no-store" });
    const data = (await res.json()) as { live?: boolean; live720?: boolean; viewers?: number };
    return {
      live: !!data.live,
      live720: !!data.live720,
      viewers: Math.max(0, Number(data.viewers) || 0),
    };
  } catch {
    return { live: false, live720: false, viewers: 0 };
  }
}

export function LivestreamPlayer({ hlsUrl, hls720Url, title }: LivestreamPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const liveRef = useRef(false);
  const live720Ref = useRef(false);
  const loadedUrlRef = useRef("");
  const volumeRef = useRef(1);

  const [playerState, setPlayerState] = useState<PlayerState>("loading");
  const [quality, setQuality] = useState<Quality>("1080");
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const url1080 = hlsUrl?.trim() || HLS_1080;
  const url720 = hls720Url?.trim() || HLS_720;

  const pickUrl = useCallback(() => {
    if (quality === "720" && live720Ref.current) return url720;
    return url1080;
  }, [quality, url1080, url720]);

  const applyVolume = useCallback((next: number, mute?: boolean) => {
    const v = clampVolume(next);
    volumeRef.current = v;
    setVolume(v);
    window.localStorage.setItem(VOLUME_KEY, String(v));

    const video = videoRef.current;
    if (!video) return;

    video.volume = v;
    const muted = mute ?? v === 0;
    video.muted = muted;
    setIsMuted(muted);
    if (!muted) setNeedsSoundTap(false);
  }, []);

  const playWithSound = useCallback(async (forceUnmute = false) => {
    const video = videoRef.current;
    if (!video || !liveRef.current) return;

    video.volume = volumeRef.current;
    if (forceUnmute && volumeRef.current > 0) {
      video.muted = false;
      setIsMuted(false);
    }

    try {
      await video.play();
      setNeedsSoundTap(false);
      setIsMuted(video.muted);
    } catch {
      if (!video.muted) {
        video.muted = true;
        setIsMuted(true);
        try {
          await video.play();
          setNeedsSoundTap(true);
        } catch {
          setNeedsSoundTap(true);
        }
      }
    }
  }, []);

  const unmute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const v = volumeRef.current > 0 ? volumeRef.current : 1;
    applyVolume(v, false);
    void video.play().catch(() => {});
  }, [applyVolume]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || volumeRef.current === 0) {
      unmute();
      return;
    }
    video.muted = true;
    setIsMuted(true);
  }, [unmute]);

  const changeVolume = useCallback(
    (next: number) => {
      applyVolume(next, next === 0);
    },
    [applyVolume],
  );

  const nudgeVolume = useCallback(
    (delta: number) => {
      changeVolume(clampVolume(volumeRef.current + delta));
    },
    [changeVolume],
  );

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    const video = videoRef.current as FullscreenVideo | null;
    if (!shell || !video) return;

    try {
      if (isFullscreenActive() || video.webkitDisplayingFullscreen) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else video.webkitExitFullscreen?.();
        return;
      }
      if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }
      const req = shell.requestFullscreen ?? (shell as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
      if (req) await req.call(shell);
    } catch {
      /* unsupported */
    }
  }, []);

  const changeQuality = useCallback((next: Quality) => {
    setQuality(next);
    window.localStorage.setItem(QUALITY_KEY, next);
  }, []);

  useEffect(() => {
    setQuality(readQuality());
    applyVolume(readVolume(), readVolume() === 0);
  }, [applyVolume]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "f" || event.key === "F") void toggleFullscreen();
      if (event.key === "m" || event.key === "M") toggleMute();
      if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeVolume(0.05);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeVolume(-0.05);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen, toggleMute, nudgeVolume]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(isFullscreenActive());
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const viewerId = getViewerId();
    const leave = () => {
      if (!viewerId) return;
      const body = JSON.stringify({ id: viewerId });
      navigator.sendBeacon("/api/livestream/leave", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hls: Hls | null = null;

    const destroyHls = () => {
      hls?.destroy();
      hls = null;
      hlsRef.current = null;
      loadedUrlRef.current = "";
    };

    const goOffline = () => {
      liveRef.current = false;
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      video.load();
      setNeedsSoundTap(false);
      setPlayerState("offline");
    };

    const attachHls = (url: string, firstLoad = false) => {
      if (loadedUrlRef.current === url && hlsRef.current) return;

      destroyHls();
      if (firstLoad) setPlayerState("loading");

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        loadedUrlRef.current = url;
        video.src = url;
        video.onloadedmetadata = () => {
          if (!cancelled && liveRef.current) {
            setPlayerState("live");
            void playWithSound(true);
          }
        };
        return;
      }

      if (!Hls.isSupported()) {
        goOffline();
        return;
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 90,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
        maxLiveSyncPlaybackRate: 1.05,
        maxBufferHole: 1,
        manifestLoadingMaxRetry: 12,
        manifestLoadingRetryDelay: 1000,
      });

      hlsRef.current = hls;
      loadedUrlRef.current = url;
      hls.attachMedia(video);
      hls.loadSource(url);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled || !liveRef.current) return;
        setPlayerState("live");
        void playWithSound(true);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !hls || !data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          void video.play().catch(() => {});
          return;
        }

        goOffline();
      });
    };

    const startLive = async (firstLoad = false) => {
      const status = await fetchStreamStatus(getViewerId());
      live720Ref.current = status.live720;
      setViewerCount(status.viewers);

      if (!status.live) {
        goOffline();
        return;
      }

      liveRef.current = true;
      const url = pickUrl();
      attachHls(url, firstLoad);
    };

    void startLive(true);

    const poll = window.setInterval(async () => {
      if (cancelled) return;
      const status = await fetchStreamStatus(getViewerId());
      live720Ref.current = status.live720;
      setViewerCount(status.viewers);

      if (!status.live) {
        if (liveRef.current) goOffline();
        return;
      }

      if (!liveRef.current) {
        liveRef.current = true;
        attachHls(pickUrl(), true);
      }
    }, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      destroyHls();
    };
  }, [url1080, url720, quality, pickUrl, playWithSound]);

  const isOffline = playerState === "offline";
  const showControls = playerState === "live" || playerState === "loading";

  return (
    <div
      ref={shellRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        width: "100%",
        height: "100%",
        background: "#000",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        preload="auto"
        aria-label={title}
        onClick={() => {
          if (needsSoundTap || isMuted) unmute();
        }}
        onDoubleClick={() => void toggleFullscreen()}
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          objectFit: "contain",
          visibility: isOffline ? "hidden" : "visible",
        }}
      />

      {isOffline ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            zIndex: 55,
            color: "#fff",
            textAlign: "center",
            padding: "1.5rem",
          }}
        >
          <div>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Stream offline</p>
            <p style={{ fontSize: "0.95rem", opacity: 0.65, marginTop: "0.5rem" }}>
              Check back when the broadcast starts
            </p>
          </div>
        </div>
      ) : null}

      {!isOffline && needsSoundTap ? (
        <button
          type="button"
          onClick={unmute}
          style={{
            position: "absolute",
            left: "50%",
            bottom: "5rem",
            transform: "translateX(-50%)",
            zIndex: 62,
            padding: "0.75rem 1.25rem",
            borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tap for sound
        </button>
      ) : null}

      {playerState === "live" ? (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            zIndex: 62,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.4rem 0.75rem",
            borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "9999px",
              background: "#ef4444",
              boxShadow: "0 0 6px rgba(239,68,68,0.8)",
            }}
          />
          <span>LIVE</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ fontWeight: 500, opacity: 0.9 }}>{formatViewerCount(viewerCount)}</span>
        </div>
      ) : null}

      {showControls && !isOffline ? (
        <div style={controlBar}>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            title={isMuted ? "Unmute (M)" : "Mute (M)"}
            style={iconBtn}
          >
            {isMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M16 9l4 4M20 9l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M15 9a4 4 0 010 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => changeVolume(Number(e.target.value) / 100)}
            aria-label="Volume"
            title="Volume (↑ / ↓)"
            style={volumeSlider}
          />

          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#fff", fontSize: "0.85rem" }}>
            <span style={{ opacity: 0.85 }}>Quality</span>
            <select
              value={quality}
              onChange={(e) => changeQuality(e.target.value as Quality)}
              aria-label="Stream quality"
              style={{
                padding: "0.35rem 0.5rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="1080">1080p</option>
              <option value="720">720p</option>
            </select>
          </label>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            style={iconBtn}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 9H5V5M15 9h4V5M15 15h4v4M9 15H5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
