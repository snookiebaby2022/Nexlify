import type { Stream } from "@prisma/client";
import { StreamType } from "@prisma/client";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "./resolve-stream-url";
import { isIntegrationStreamUrl } from "./integration-stream-url";

type LineCreds = { username: string; password: string };

function vodExtension(stream: Pick<Stream, "containerExtension" | "type">): string {
  const ext = stream.containerExtension?.trim();
  if (ext) return ext.replace(/^\./, "");
  return stream.type === StreamType.SERIES ? "mkv" : "mp4";
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * URL placed in M3U / Xtream exports.
 * Plugin imports (nexlify://…) are proxied through /movie/… so playback resolves like /live/.
 */
export function exportPlaybackUrl(
  baseUrl: string,
  line: LineCreds,
  stream: Pick<Stream, "id" | "type" | "streamUrl" | "containerExtension">,
  full?: StreamWithProvider,
  seed?: string
): string {
  const resolved = (full ?? stream) as StreamWithProvider;

  if (stream.type === StreamType.LIVE) {
    return `${trimBase(baseUrl)}/live/${line.username}/${line.password}/${stream.id}.ts`;
  }

  if (isIntegrationStreamUrl(stream.streamUrl)) {
    const ext = vodExtension(stream);
    return `${trimBase(baseUrl)}/movie/${line.username}/${line.password}/${stream.id}.${ext}`;
  }

  return resolveStreamPlaybackUrl(resolved, seed);
}
