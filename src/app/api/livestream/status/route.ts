import { NextResponse } from "next/server";
import { getLivestreamConfig } from "@/lib/livestream";
import { getViewerCount, isValidViewerId, touchViewer } from "@/lib/livestream-viewers";

export const dynamic = "force-dynamic";

async function manifestLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    const hasSegments = body.includes("#EXTINF") || body.includes(".ts") || body.includes(".m4s");
    const notEnded = !body.includes("#EXT-X-ENDLIST");
    return hasSegments && notEnded;
  } catch {
    return false;
  }
}

/** Returns whether the configured HLS manifests appear to be live. */
export async function GET(request: Request) {
  const viewerId = new URL(request.url).searchParams.get("viewerId")?.trim() ?? "";

  const { hlsUrl, hls720Url } = getLivestreamConfig();
  const [live, live720] = await Promise.all([manifestLive(hlsUrl), manifestLive(hls720Url)]);

  if (live && isValidViewerId(viewerId)) touchViewer(viewerId);

  return NextResponse.json({
    live,
    live720,
    hlsUrl,
    hls720Url,
    viewers: live ? getViewerCount() : 0,
  });
}
