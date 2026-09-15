import { STREAM_HTTP_PORT } from "@/lib/server-ports";

export const CANONICAL_PLAYBACK_EDGE_HOST = "209.237.141.15";

export type PlaybackEdgeIdentity = {
  name?: string | null;
  host?: string | null;
};

/** Primary live playback edge (10gbs) — must stay active for Xtream clients. */
export function isCanonicalPlaybackEdgeServer(server: PlaybackEdgeIdentity): boolean {
  const name = String(server.name ?? "").trim();
  const host = String(server.host ?? "").trim();
  if (/10gbs/i.test(name)) return true;
  if (host === CANONICAL_PLAYBACK_EDGE_HOST) return true;
  const extra = String(process.env.NEXLIFY_PLAYBACK_EDGE_HOSTS ?? "")
    .split(/[,;\s]+/)
    .map((h) => h.trim())
    .filter(Boolean);
  return extra.includes(host);
}

export function allowDeactivatePlaybackEdge(): boolean {
  return process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE === "1";
}

export function canonicalPlaybackEdgeDeactivateError(): string {
  return (
    "This server is the canonical live playback edge (10gbs). Deactivating it stops all streams. " +
    "Set ALLOW_DEACTIVATE_PLAYBACK_EDGE=1 on the panel only if you intentionally need to disable it."
  );
}

export function assertCanSetPlaybackEdgeInactive(
  server: PlaybackEdgeIdentity,
  nextIsActive: boolean | undefined
): { ok: true } | { ok: false; error: string } {
  if (nextIsActive !== false) return { ok: true };
  if (!isCanonicalPlaybackEdgeServer(server)) return { ok: true };
  if (allowDeactivatePlaybackEdge()) return { ok: true };
  return { ok: false, error: canonicalPlaybackEdgeDeactivateError() };
}

export function expectedPlaybackEdgePort(): number {
  return STREAM_HTTP_PORT;
}
