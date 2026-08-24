import mpegts from "mpegts.js";

export type StreamPlayerHandle = {
  destroy: () => void;
};

type MpegTsPlayer = {
  attachMediaElement: (el: HTMLVideoElement) => void;
  load: () => void;
  play: () => Promise<void> | void;
  pause: () => void;
  unload: () => void;
  detachMediaElement: () => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

function isMpegTsUrl(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return /\.ts$/i.test(path) && !/\.m3u8$/i.test(path);
}

/** Live MPEG-TS via MSE (Chrome/Edge/Firefox). Safari falls back to HLS. */
export function attachMpegTsIfSupported(
  video: HTMLVideoElement,
  url: string,
  onError?: (msg: string) => void
): StreamPlayerHandle | null {
  if (!isMpegTsUrl(url) || !mpegts.isSupported()) return null;
  const holder = video as HTMLVideoElement & { __mpegts?: MpegTsPlayer };
  try {
    holder.__mpegts?.destroy();
  } catch {
    /* ignore */
  }
  const player = mpegts.createPlayer(
    { type: "mse", isLive: true, url, cors: true },
    {
      enableStashBuffer: true,
      stashInitialSize: 128 * 1024,
      isLive: true,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.5,
    }
  ) as MpegTsPlayer;
  holder.__mpegts = player;
  player.on(mpegts.Events.ERROR, (...args: unknown[]) => {
    const detail = args.find((a) => typeof a === "string");
    onError?.(String(detail || "Live stream error"));
  });
  player.attachMediaElement(video);
  player.load();
  void player.play();
  return {
    destroy() {
      try {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      } catch {
        /* ignore */
      }
      holder.__mpegts = undefined;
    },
  };
}

export { isMpegTsUrl };
