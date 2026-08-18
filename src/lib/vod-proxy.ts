import { NextResponse } from "next/server";
import {
  buildHlsRelayUrl,
  isHlsPlaybackUrl,
  rewriteHlsManifestForRelay,
} from "@/lib/hls-playback";
import { iptvText, withIptvCors } from "@/lib/iptv-cors";

export const VOD_UPSTREAM_TIMEOUT_MS = 30_000;

export type VodProxyTarget = {
  username: string;
  password: string;
  streamId: string;
  playbackUrl: string;
  userAgent?: string;
  reqRange?: string | null;
  panelOrigin: string;
};

function normalizeMediaContentType(contentType: string, url: string): string {
  const lowerCt = contentType.toLowerCase();
  if (
    lowerCt.includes("mpegurl") ||
    lowerCt.includes("x-mpegurl") ||
    lowerCt.includes("vnd.apple.mpegurl") ||
    url.toLowerCase().includes(".m3u8")
  ) {
    return "application/vnd.apple.mpegurl";
  }
  if (
    lowerCt.includes("mp2t") ||
    lowerCt.includes("mpeg-ts") ||
    lowerCt.includes("mpegts") ||
    lowerCt.includes("video/ts") ||
    url.toLowerCase().endsWith(".ts")
  ) {
    return "video/mp2t";
  }
  if (lowerCt.includes("mp4") || url.toLowerCase().endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lowerCt.includes("mkv") || url.toLowerCase().endsWith(".mkv")) {
    return "video/x-matroska";
  }
  if (lowerCt.includes("avi") || url.toLowerCase().endsWith(".avi")) {
    return "video/x-msvideo";
  }
  if (lowerCt.includes("webm") || url.toLowerCase().endsWith(".webm")) {
    return "video/webm";
  }
  return contentType || "application/octet-stream";
}

export async function proxyVodUpstream(target: VodProxyTarget): Promise<NextResponse> {
  const { playbackUrl, userAgent, reqRange, panelOrigin, username, password, streamId } = target;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOD_UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(playbackUrl, {
      headers: {
        ...(userAgent ? { "User-Agent": userAgent } : {}),
        Accept: "*/*",
        ...(reqRange ? { Range: reqRange } : {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return iptvText("Media unavailable", {
        status: upstream.status === 404 ? 404 : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const normalized = normalizeMediaContentType(contentType, playbackUrl);
    const isManifest =
      normalized === "application/vnd.apple.mpegurl" ||
      playbackUrl.toLowerCase().includes(".m3u8");

    if (isManifest) {
      const body = await upstream.text();
      if (!body.trim().startsWith("#EXT")) {
        return iptvText("Invalid HLS manifest", { status: 502 });
      }
      const relay = (url: string) =>
        buildHlsRelayUrl(panelOrigin, username, password, streamId, url);
      const rewritten = rewriteHlsManifestForRelay(body, upstream.url || playbackUrl, relay);
      return withIptvCors(
        new NextResponse(rewritten, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "private, no-cache, no-store",
          },
        })
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": normalized,
      "Cache-Control": "private, no-cache, no-store",
    };

    const upstreamLength = upstream.headers.get("content-length");
    if (upstreamLength) headers["Content-Length"] = upstreamLength;

    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;

    if (upstream.status === 206) {
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) headers["Content-Range"] = contentRange;
    }

    return withIptvCors(
      new NextResponse(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers,
      })
    );
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return iptvText(isTimeout ? "Upstream timeout" : "Media fetch failed", {
      status: isTimeout ? 504 : 502,
    });
  }
}

export function pickVodExtension(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "m3u8";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".mp4")) return "mp4";
  if (lower.endsWith(".mkv")) return "mkv";
  if (lower.endsWith(".avi")) return "avi";
  if (lower.endsWith(".mov")) return "mov";
  if (lower.endsWith(".webm")) return "webm";
  if (isHlsPlaybackUrl(url)) return "m3u8";
  return "mp4";
}
