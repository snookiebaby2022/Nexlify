import Hls from "hls.js";

export type StreamPlayerHandle = {
  destroy: () => void;
};

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
  const isHls = url.includes(".m3u8") || url.includes("/hls/");

  // Destroy any existing hls instance
  const prevHls = (video as any).__hlsInstance as Hls | undefined;
  if (prevHls) {
    prevHls.destroy();
    (video as any).__hlsInstance = null;
  }

  if (isHls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      startFragPrefetch: true,
      debug: false,
    });

    (video as any).__hlsInstance = hls;

    return new Promise<StreamPlayerHandle>((resolve) => {
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Autoplay blocked — play overlay will handle user click
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              onError?.("Network error — retrying...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
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

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        onLevelSwitch?.(data.level);
      });

      resolve({
        destroy() {
          hls.destroy();
          (video as any).__hlsInstance = null;
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
