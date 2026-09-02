/**
 * XUI / 1-stream live MPEG-TS ignores Range and pipes the stream.
 * LibVLC (XCIPTV VLC, IPTV Smarters) opens live with `Range: bytes=0-`.
 * That is playback, not a byte probe. Only tiny finite ranges are probes
 * (XCIPTV Update Content checking that a URL exists).
 *
 * webOS / Tizen native players also send `Range: bytes=0-1` — that is a real
 * open, not XCIPTV catalog sniffing. Treat those as playback.
 */
export function userAgentIsSmartTv(userAgent?: string | null): boolean {
  const s = String(userAgent ?? "").toLowerCase();
  return (
    s.includes("web0s") ||
    s.includes("webos") ||
    s.includes("tizen") ||
    s.includes("netcast") ||
    s.includes("webappmanager") ||
    s.includes("smarttv") ||
    s.includes("smart-tv")
  );
}

/**
 * IPTV apps that break when server_info advertises :8080 / :443 on the stream host.
 * Use plain :80 / http for API + EPG after login (Smarters, Nexus, Lavf/VLC engines).
 */
export function userAgentUsesStandardIptvPorts(userAgent?: string | null): boolean {
  if (userAgentIsSmartTv(userAgent)) return true;
  const s = String(userAgent ?? "").toLowerCase();
  return (
    s.includes("nexus") ||
    s.includes("nexustv") ||
    s.includes("smarters") ||
    s.includes("xciptv") ||
    s.includes("tivimate") ||
    s.includes("perfect player") ||
    s.includes("lavf/") ||
    s.includes("libvlc") ||
    s.includes("vlc/")
  );
}

export function isTinyLiveRangeProbe(range?: string | null, userAgent?: string | null): boolean {
  if (userAgentIsSmartTv(userAgent)) return false;
  const r = String(range ?? "").trim();
  if (!r) return false;
  const m = /^bytes=(\d+)-(\d+)$/i.exec(r);
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  return end - start < 65_536;
}
