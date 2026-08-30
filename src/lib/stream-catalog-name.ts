/** EPG sync used to overwrite catalog names with programme titles like "(424) (2098-12-31 08:02:04)". */

const GARBAGE_NAME =
  /^\(\d+\)\s*\(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\)|^unknown$|^untitled(?:\s+channel)?$|^\s*$/i;

export function isGarbageStreamName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (!n) return true;
  return GARBAGE_NAME.test(n);
}

/** Best-effort name from a logo URL (e.g. …/ESPN+_424.png → ESPN+ 424). */
export function nameFromStreamIcon(icon: string | null | undefined): string {
  const raw = String(icon ?? "").trim();
  if (!raw) return "";
  try {
    const path = new URL(raw, "http://local.invalid").pathname;
    const base = decodeURIComponent(path.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
    const cleaned = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length >= 2 && !isGarbageStreamName(cleaned) && !/^(logo|icon|image|default)$/i.test(cleaned)) {
      return cleaned;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function displayCatalogStreamName(
  name: string | null | undefined,
  fallback?: string | null
): string {
  const n = String(name ?? "").trim();
  if (!isGarbageStreamName(n)) return n;
  const fb = String(fallback ?? "").trim();
  const fromIcon = nameFromStreamIcon(fb);
  if (/^https?:\/\//i.test(fb) && fromIcon) return fromIcon;
  if (fb && !isGarbageStreamName(fb)) return fb;
  if (fromIcon) return fromIcon;
  return "Untitled channel";
}

export function isUsefulNowPlayingTitle(title: string | null | undefined): boolean {
  const t = String(title ?? "").trim();
  if (!t || isGarbageStreamName(t)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;
  return t.length >= 2 && t.length <= 180;
}
