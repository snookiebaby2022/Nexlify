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

/**
 * Normalize a saved/displayed MAG (or Enigma) portal URL so UI/copy never shows a
 * bare host. StbEmu/MAG need `…/c/`; root alone is a black screen.
 * Leaves alternate Stalker/API paths alone.
 */
export function ensureMagPortalUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  const noTrail = raw.replace(/\/+$/, "");
  if (/\/c$/i.test(noTrail)) return `${noTrail}/`;
  if (/\/stalker_portal\//i.test(noTrail) || /\/portal\.php/i.test(noTrail)) return noTrail;
  return magPortalUrl(noTrail);
}

/** Full Stalker path (same handler as /c/). */
export function stalkerPortalUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/stalker_portal/server/load.php`;
}
