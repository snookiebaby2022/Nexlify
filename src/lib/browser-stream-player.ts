import type Hls from "hls.js";

export type StreamPlayerHandle = {
  destroy: () => void;
};

const noopHandle: StreamPlayerHandle = { destroy() {} };

/**
 * Attach a URL (HLS or native video) to a <video> element.
 * Returns a handle with destroy() for cleanup.
 */
export async function attachUrlToVideo(
  video: HTMLVideoElement,
  url: string,
  onError?: (msg: string) => void,
  onLevelSwitch?: (level: number) => void
): Promise<StreamPlayerHandle> {
  if (typeof window === "undefined") return noopHandle;

  const [{ default: HlsLib }, { attachMpegTsIfSupported }] = await Promise.all([
    import("hls.js"),
    import("@/lib/attach-mpegts"),
  ]);

  const isHls = url.includes(".m3u8") || url.includes("/hls/");

  // Destroy any existing hls instance
  const prevHls = (video as HTMLVideoElement & { __hlsInstance?: Hls }).__hlsInstance;
  if (prevHls) {
    prevHls.destroy();
    (video as HTMLVideoElement & { __hlsInstance?: Hls }).__hlsInstance = undefined;
  }

  const mpeg = attachMpegTsIfSupported(video, url, onError);
  if (mpeg) return mpeg;

  if (isHls && HlsLib.isSupported()) {
    const hls = new HlsLib({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 10,
      maxBufferLength: 6,
      maxMaxBufferLength: 12,
      startFragPrefetch: true,
      liveDurationInfinity: true,
      debug: false,
    });

    (video as HTMLVideoElement & { __hlsInstance?: Hls }).__hlsInstance = hls;

    return new Promise<StreamPlayerHandle>((resolve) => {
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Autoplay blocked — play overlay will handle user click
        });
      });

      hls.on(HlsLib.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case HlsLib.ErrorTypes.NETWORK_ERROR:
              onError?.("Network error — retrying...");
              hls.startLoad();
              break;
            case HlsLib.ErrorTypes.MEDIA_ERROR:
              onError?.("Media error — recovering...");
              hls.recoverMediaError();
              break;
            default:
              onError?.("Playback error — click retry");
              hls.destroy();
              break;
          }
        }
      });

      hls.on(HlsLib.Events.LEVEL_SWITCHED, (_event, data) => {
        onLevelSwitch?.(data.level);
      });

      resolve({
        destroy() {
          hls.destroy();
          (video as HTMLVideoElement & { __hlsInstance?: Hls }).__hlsInstance = undefined;
        },
      });
    });
  }

  // Native playback (Safari, or non-HLS)
  video.src = url;
  try {
    await video.play();
  } catch {
    onError?.("Click play to start");
  }

  return {
    destroy() {
      video.removeAttribute("src");
      video.load();
    },
  };
}
