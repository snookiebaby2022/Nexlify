import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";

/** Resolve a stream row or raw URL to an HTTP(S) URL suitable for probing. */
export async function resolveProbeTargetUrl(
  raw: string,
  stream?: StreamWithProvider | null
): Promise<{ url: string; label: string }> {
  const trimmed = String(raw ?? "").trim();
  const source = stream?.streamUrl?.trim() || trimmed;
  if (!source) return { url: "", label: "empty" };

  if (stream && (!trimmed || isIntegrationStreamUrl(trimmed) || trimmed === stream.streamUrl)) {
    if (isIntegrationStreamUrl(stream.streamUrl)) {
      const resolved = await resolveIntegrationPlaybackUrl(stream.streamUrl);
      if (resolved) {
        return { url: resolved, label: "integration" };
      }
      return { url: stream.streamUrl, label: "integration-unresolved" };
    }
    const playback = resolveStreamPlaybackUrl(stream);
    if (/^https?:\/\//i.test(playback)) {
      return { url: playback, label: "playback" };
    }
  }

  if (isIntegrationStreamUrl(source)) {
    const resolved = await resolveIntegrationPlaybackUrl(source);
    if (resolved) return { url: resolved, label: "integration" };
    return { url: source, label: "integration-unresolved" };
  }

  if (/^https?:\/\//i.test(source)) {
    return { url: source, label: "direct" };
  }

  return { url: source, label: "unsupported" };
}
