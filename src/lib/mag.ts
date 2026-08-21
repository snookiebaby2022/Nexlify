export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return hex.match(/.{2}/g)!.join(":");
}

/** Short MAG portal URL — industry default; serves Stalker API at /c/. */
export function magPortalUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/c/`;
}

/** Full Stalker path (same handler as /c/). */
export function stalkerPortalUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/stalker_portal/server/load.php`;
}
