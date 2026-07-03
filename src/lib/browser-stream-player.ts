/** Load HLS.js or mpegts.js and attach a URL to a video element (same-origin panel URLs). */

export type BrowserStreamMode = "hls" | "mpegts" | "direct";

export function detectBrowserStreamMode(url: string): BrowserStreamMode {
  const path = url.split("?")[0].toLowerCase();
  if (path.includes(".m3u8") || url.includes("/preview/hls")) return "hls";
  if (path.endsWith(".ts") || url.includes("/preview/media") || url.includes("/live/")) return "mpegts";
  return "direct";
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export type StreamPlayerHandle = {
  destroy: () => void;
};

export async function attachUrlToVideo(
  video: HTMLVideoElement,
  url: string,
  onError?: (msg: string) => void
): Promise<StreamPlayerHandle | null> {
  const mode = detectBrowserStreamMode(url);

  if (mode === "hls") {
    await loadScript("https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js");
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
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on("hlsError", () => onError?.("HLS playback failed"));
      void video.play().catch(() => undefined);
      return { destroy: () => hls.destroy() };
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void video.play().catch(() => undefined);
      return null;
    }
    onError?.("HLS not supported in this browser");
    return null;
  }

  if (mode === "mpegts") {
    await loadScript("https://cdn.jsdelivr.net/npm/mpegts.js@1.7.13/dist/mpegts.js");
    const mpegts = (
      window as unknown as {
        mpegts?: {
          isSupported: () => boolean;
          createPlayer: (
            mediaDataSource: { type: string; isLive: boolean; url: string },
            config?: object
          ) => {
            attachMediaElement: (v: HTMLVideoElement) => void;
            load: () => void;
            play: () => Promise<void>;
            destroy: () => void;
            on: (e: string, cb: () => void) => void;
          };
        };
      }
    ).mpegts;
    if (mpegts?.isSupported()) {
      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: true, url },
        { enableWorker: true, lazyLoad: false }
      );
      player.attachMediaElement(video);
      player.load();
      player.on("error", () => onError?.("MPEG-TS playback failed"));
      void player.play().catch(() => undefined);
      return { destroy: () => player.destroy() };
    }
    video.src = url;
    void video.play().catch(() => onError?.("Autoplay blocked or TS not supported"));
    return null;
  }

  video.src = url;
  void video.play().catch(() => onError?.("Autoplay blocked"));
  return null;
}
