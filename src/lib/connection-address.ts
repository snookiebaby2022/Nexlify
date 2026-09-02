/** Normalize client IP for DB, cache keys, and viewer identity. */
export function normalizeConnectionIp(ip?: string | null): string | null {
  let raw = ip?.trim() ?? "";
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (!raw || raw === "127.0.0.1" || raw === "::1") return null;
  return raw;
}

/** Stable key for UI rows (line + stream + viewer IP). */
export function connectionViewerSessionKey(
  lineId: string,
  streamId: string | null | undefined,
  ip?: string | null
): string {
  return `${lineId}|${streamId ?? ""}|${normalizeConnectionIp(ip) ?? ""}`;
}
