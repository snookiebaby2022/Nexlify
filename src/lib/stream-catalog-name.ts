/** EPG sync used to overwrite catalog names with programme titles like "(424) (2098-12-31 08:02:04)". */

const GARBAGE_NAME =
  /^\(\d+\)\s*\(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\)|^unknown$|^\s*$/i;

export function isGarbageStreamName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (!n) return true;
  return GARBAGE_NAME.test(n);
}

export function displayCatalogStreamName(
  name: string | null | undefined,
  fallback?: string | null
): string {
  const n = String(name ?? "").trim();
  if (!isGarbageStreamName(n)) return n;
  const fb = String(fallback ?? "").trim();
  if (fb && !isGarbageStreamName(fb)) return fb;
  return "Untitled channel";
}

export function isUsefulNowPlayingTitle(title: string | null | undefined): boolean {
  const t = String(title ?? "").trim();
  if (!t || isGarbageStreamName(t)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;
  return t.length >= 2 && t.length <= 180;
}
