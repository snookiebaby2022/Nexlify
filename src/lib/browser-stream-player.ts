export type BrowserStreamMode = "direct";

export function detectBrowserStreamMode(_url: string): BrowserStreamMode {
  return "direct";
}

export type StreamPlayerHandle = {
  destroy: () => void;
};

export async function attachUrlToVideo(
  video: HTMLVideoElement,
  url: string,
  onError?: (msg: string) => void
): Promise<StreamPlayerHandle | null> {
  video.src = url;
  const playPromise = video.play();
  if (playPromise) {
    playPromise.catch(() => onError?.("Autoplay blocked — click play to start"));
  }
  return null;
}
