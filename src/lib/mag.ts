export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return hex.match(/.{2}/g)!.join(":");
}

/** Stalker/Ministra portal — MAG and Enigma2 boxes must use this URL, not /c/ HTML help. */
export function stalkerPortalUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/stalker_portal/server/load.php`;
}

export function magPortalUrl(baseUrl: string) {
  return stalkerPortalUrl(baseUrl);
}
