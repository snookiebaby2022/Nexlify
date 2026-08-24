/**
 * XUI / 1-stream live MPEG-TS ignores Range and pipes the stream.
 * LibVLC (XCIPTV VLC, IPTV Smarters) opens live with `Range: bytes=0-`.
 * That is playback, not a byte probe. Only tiny finite ranges are probes
 * (XCIPTV Update Content checking that a URL exists).
 */
export function isTinyLiveRangeProbe(range?: string | null): boolean {
  const r = String(range ?? "").trim();
  if (!r) return false;
  const m = /^bytes=(\d+)-(\d+)$/i.exec(r);
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  return end - start < 65_536;
}
