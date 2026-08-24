"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { attachMpegTsIfSupported } from "@/lib/attach-mpegts";

export type StreamPlayerHandle = {
  destroy: () => void;
};

export type PlayerState = {
  buffering: boolean;
  isPlaying: boolean;
  error: string;
  duration: number;
  currentTime: number;
};

export type UseHlsPlayerReturn = {
  state: PlayerState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playStream: (url: string) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  toggleMuted: () => void;
  retry: () => void;
  destroy: () => void;
};

type HlsPlayerConfig = NonNullable<ConstructorParameters<typeof Hls>[0]>;

const HLS_CONFIG: Partial<HlsPlayerConfig> = {
  enableWorker: true,
  lowLatencyMode: false,

  // Buffer settings — stable playback, not ultra-low-latency
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000, // 60MB
  maxBufferHole: 1.0,

  // Live stream — stay behind live edge for stability
  liveSyncDurationCount: 0,
  liveMaxLatencyDurationCount: 10,
  liveBackBufferLength: 30,
  liveDurationInfinity: false,

  // Discontinuity / ad-transition handling
  stretchShortVideoTrack: true,
  forceKeyFrameOnDiscontinuity: true,
  maxAudioFramesDrift: 8,

  // Stall recovery
  nudgeOffset: 0.2,
  nudgeMaxRetry: 6,

  // Retry limits
  levelLoadingMaxRetry: 4,
  manifestLoadingMaxRetry: 4,
  fragLoadingMaxRetry: 6,

  // Disable progressive mode — more stable with discontinuities
  progressive: false,

  // Subtitles
  enableCEA708Captions: true,
  enableWebVTT: true,
  renderTextTracksNatively: true,

  debug: false,
};

const NETWORK_RETRY_LIMIT = 3;
const NETWORK_RETRY_BASE_MS = 1000;
const MEDIA_ERROR_COOLDOWN_MS = 2000;
const MEDIA_ERROR_ESCALATION_COUNT = 3;

/**
 * React hook wrapping hls.js with robust error handling,
 * retry logic, proxy fallback on CORS errors, and media-error recovery.
 *
 * Based on nodecast-tv's VideoPlayer.js approach.
 */
export function useHlsPlayer(opts?: {
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (vol: number) => void;
  onMutedChange?: (muted: boolean) => void;
}): UseHlsPlayerReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const urlRef = useRef<string>("");
  const retryRef = useRef<() => void>(() => {});

  const [state, setState] = useState<PlayerState>({
    buffering: false,
    isPlaying: false,
    error: "",
    duration: 0,
    currentTime: 0,
  });

  // Internal mutable state for retry counters
  const networkRetryCount = useRef(0);
  const lastNetworkErrorTime = useRef(0);
  const lastRecoveryAttempt = useRef(0);
  const mediaErrorCount = useRef(0);
  const lastDiscontinuity = useRef(-1);

  const destroy = useCallback(() => {
    if (hlsRef.current) {
      try { hlsRef.current.detachMedia(); } catch { /* ignore */ }
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      const mpeg = (video as unknown as { __mpegtsHandle?: { destroy: () => void } }).__mpegtsHandle;
      try { mpeg?.destroy(); } catch { /* ignore */ }
      (video as unknown as { __mpegtsHandle?: { destroy: () => void } }).__mpegtsHandle = undefined;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  const playStream = useCallback(
    (url: string) => {
      destroy();
      const video = videoRef.current;
      if (!video) return;

      urlRef.current = url;
      setState((s) => ({ ...s, buffering: true, error: "", isPlaying: false }));
      networkRetryCount.current = 0;
      lastNetworkErrorTime.current = 0;
      lastRecoveryAttempt.current = 0;
      mediaErrorCount.current = 0;
      lastDiscontinuity.current = -1;

      const mpeg = attachMpegTsIfSupported(video, url, (msg) =>
        setState((s) => ({ ...s, buffering: false, error: msg }))
      );
      if (mpeg) {
        (video as unknown as { __mpegtsHandle?: { destroy: () => void } }).__mpegtsHandle = mpeg;
        retryRef.current = () => playStream(url);
        return;
      }

      const isHls =
        url.includes(".m3u8") || url.includes("/hls/") || url.includes("m3u8");

      if (isHls && Hls.isSupported()) {
        const hls = new Hls(HLS_CONFIG);
        hlsRef.current = hls;

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            const now = Date.now();

            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: {
                networkRetryCount.current += 1;
                const timeSinceLast = now - lastNetworkErrorTime.current;
                lastNetworkErrorTime.current = now;

                if (timeSinceLast > 30_000) {
                  networkRetryCount.current = 1;
                }

                if (networkRetryCount.current <= NETWORK_RETRY_LIMIT) {
                  const delay = networkRetryCount.current * NETWORK_RETRY_BASE_MS;
                  setTimeout(() => hls.startLoad(), delay);
                } else {
                  // Max retries — just keep retrying on the same source
                  networkRetryCount.current = 0;
                  hls.startLoad();
                }
                break;
              }

              case Hls.ErrorTypes.MEDIA_ERROR: {
                if (now - lastRecoveryAttempt.current < MEDIA_ERROR_COOLDOWN_MS) {
                  mediaErrorCount.current += 1;
                } else {
                  mediaErrorCount.current = 1;
                }

                if (now - lastRecoveryAttempt.current > MEDIA_ERROR_COOLDOWN_MS) {
                  lastRecoveryAttempt.current = now;

                  if (mediaErrorCount.current >= MEDIA_ERROR_ESCALATION_COUNT) {
                    hls.swapAudioCodec();
                    mediaErrorCount.current = 0;
                  }

                  hls.recoverMediaError();

                  if (
                    data.details === "fragParsingError" &&
                    !video.paused &&
                    video.currentTime > 0
                  ) {
                    setTimeout(() => {
                      if (video && !video.paused) video.currentTime += 1;
                    }, 200);
                  }
                }
                break;
              }

              default:
                setState((s) => ({
                  ...s,
                  buffering: false,
                  error: "Playback error",
                }));
                break;
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            const now = Date.now();
            if (now - lastRecoveryAttempt.current > MEDIA_ERROR_COOLDOWN_MS) {
              lastRecoveryAttempt.current = now;
              hls.recoverMediaError();
            }
          }
        });

        hls.on(Hls.Events.FRAG_CHANGED, (_event, data) => {
          const frag = data.frag;
          if (frag && frag.sn !== "initSegment") {
            if (
              frag.cc !== undefined &&
              frag.cc !== lastDiscontinuity.current
            ) {
              lastDiscontinuity.current = frag.cc;
              if (!video.paused && video.currentTime > 0) {
                video.currentTime += 0.01;
              }
            }
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {});

        retryRef.current = () => playStream(url);
      } else if (
        video.canPlayType("application/vnd.apple.mpegurl") === "probably" ||
        video.canPlayType("application/vnd.apple.mpegurl") === "maybe"
      ) {
        // Safari native HLS
        video.src = url;
        video.play().catch(() => {});
        retryRef.current = () => playStream(url);
      } else {
        // Native playback (direct TS, mp4, etc.)
        video.src = url;
        video.play().catch(() => {});
        retryRef.current = () => playStream(url);
      }
    },
    [destroy]
  );

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () =>
      setState((s) => ({ ...s, buffering: true }));
    const onPlaying = () =>
      setState((s) => ({ ...s, buffering: false, isPlaying: true }));
    const onPause = () =>
      setState((s) => ({ ...s, isPlaying: false }));
    const onPlay = () =>
      setState((s) => ({ ...s, isPlaying: true }));
    const onTimeUpdate = () =>
      setState((s) => ({ ...s, currentTime: video.currentTime, duration: video.duration || 0 }));
    const onLoadedMetadata = () =>
      setState((s) => ({ ...s, duration: video.duration || 0 }));

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  // Sync volume/muted from props
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (opts?.volume != null) video.volume = opts.volume;
    if (opts?.muted != null) video.muted = opts.muted;
  }, [opts?.volume, opts?.muted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = v;
      opts?.onVolumeChange?.(v);
    },
    [opts]
  );

  const setMuted = useCallback(
    (m: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = m;
      opts?.onMutedChange?.(m);
    },
    [opts]
  );

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    opts?.onMutedChange?.(next);
  }, [opts]);

  const retry = useCallback(() => {
    retryRef.current();
  }, []);

  // Expose playStream for external callers
  const apiRef = useRef({ playStream, state, videoRef, play, pause, togglePlay, setVolume, setMuted, toggleMuted, retry, destroy });
  apiRef.current = { playStream, state, videoRef, play, pause, togglePlay, setVolume, setMuted, toggleMuted, retry, destroy };

  return {
    state,
    videoRef,
    playStream,
    play,
    pause,
    togglePlay,
    setVolume,
    setMuted,
    toggleMuted,
    retry,
    destroy,
  };
}

/**
 * Attach a URL (HLS or native video) to a <video> element.
 * Uses the same robust config as useHlsPlayer.
 * Returns a handle with destroy() for cleanup.
 */
export async function attachUrlToVideo(
  video: HTMLVideoElement,
  url: string,
  onError?: (msg: string) => void,
  onLevelSwitch?: (level: number) => void
): Promise<{ destroy: () => void }> {
  const prevHls = (video as any).__hlsInstance as Hls | undefined;
  if (prevHls) {
    prevHls.destroy();
    (video as any).__hlsInstance = null;
  }

  const mpeg = attachMpegTsIfSupported(video, url, onError);
  if (mpeg) return mpeg;

  const isHls = url.includes(".m3u8") || url.includes("/hls/") || url.includes("m3u8");

  if (isHls && Hls.isSupported()) {
    const hls = new Hls(HLS_CONFIG);
    (video as any).__hlsInstance = hls;

    return new Promise<{ destroy: () => void }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        onError?.("Stream load timed out");
        hls.destroy();
        reject(new Error("Stream load timed out"));
      }, 15000);

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearTimeout(timeout);
        resolve({
          destroy() {
            try { hls.detachMedia(); } catch { /* ignore */ }
            hls.destroy();
            (video as any).__hlsInstance = null;
          },
        });
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              onError?.("Playback error");
              hls.destroy();
              break;
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        onLevelSwitch?.(data.level);
      });
    });
  }

  // Native playback (Safari or non-HLS)
  video.src = url;
  try {
    await video.play();
  } catch {
    // Autoplay blocked
  }

  return {
    destroy() {
      video.removeAttribute("src");
      video.load();
    },
  };
}
