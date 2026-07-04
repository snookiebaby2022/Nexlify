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
  // Mute to bypass autoplay block, then unmute
  video.muted = true;
  try {
    await video.play();
    video.muted = false;
  } catch {
    onError?.("Click play to start");
  }
  return null;
}
