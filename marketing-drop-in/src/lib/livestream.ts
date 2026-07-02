import { site } from "@/lib/site";

export type LivestreamConfig = {
  hlsUrl: string;
  hls720Url: string;
  rtmpServer: string;
  streamKey: string | null;
  title: string;
  description: string;
};

function defaultHlsUrl(): string {
  return `${site.url.replace(/\/$/, "")}/hls/nexlify.m3u8`;
}

function defaultHls720Url(): string {
  return `${site.url.replace(/\/$/, "")}/hls/nexlify-720.m3u8`;
}

function defaultRtmpServer(): string {
  const rtmpHost = process.env.NEXT_PUBLIC_LIVESTREAM_RTMP_HOST?.trim() || "rtmp.nexlify.live";
  return `rtmp://${rtmpHost}/live`;
}

/** Server-side livestream configuration from environment. */
export function getLivestreamConfig(): LivestreamConfig {
  return {
    hlsUrl: process.env.NEXT_PUBLIC_LIVESTREAM_HLS_URL?.trim() || defaultHlsUrl(),
    hls720Url: process.env.NEXT_PUBLIC_LIVESTREAM_HLS_720_URL?.trim() || defaultHls720Url(),
    rtmpServer: process.env.LIVESTREAM_RTMP_SERVER?.trim() || defaultRtmpServer(),
    streamKey: process.env.LIVESTREAM_STREAM_KEY?.trim() || null,
    title: process.env.LIVESTREAM_TITLE?.trim() || "Nexlify Live",
    description:
      process.env.LIVESTREAM_DESCRIPTION?.trim() ||
      "Watch Nexlify product demos and software updates — not TV channels.",
  };
}

/** Client-safe playback URL (public env only). */
export function getPublicHlsUrl(): string {
  return process.env.NEXT_PUBLIC_LIVESTREAM_HLS_URL?.trim() || defaultHlsUrl();
}
