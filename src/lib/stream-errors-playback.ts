export const PLAYBACK_ISSUE_ACTIONS = [
  "playback_drop",
  "playback_origin_fail",
  "playback_freeze",
  "playback_stutter",
  "stream_hls_relay_error",
  "stream_primary_failover",
] as const;

/** Playback log window length in hours (24h default; 7/30 = day shorthand). */
export function parseStreamErrorsPlaybackHours(raw: string | null | undefined): number {
  const n = Number(raw);
  if (n === 7) return 7 * 24;
  if (n === 30) return 30 * 24;
  if (n === 168) return 168;
  if (n === 720) return 720;
  if (Number.isFinite(n) && n >= 1 && n <= 720) return Math.floor(n);
  return 24;
}

export function playbackSinceFromHours(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
