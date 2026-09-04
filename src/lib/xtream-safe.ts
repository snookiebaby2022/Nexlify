/** Sanitise Xtream catalog strings so XCIPTV's JSON/XML parsers do not crash. */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function xtreamSafeText(value: unknown): string {
  return String(value ?? "")
    .replace(CONTROL, "")
    .replace(/\uFFFD/g, "")
    .trim();
}

export function xtreamUnix(date: Date | string | number | null | undefined): number {
  const ms =
    date instanceof Date
      ? date.getTime()
      : typeof date === "number"
        ? date
        : typeof date === "string"
          ? Date.parse(date)
          : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

export function xtreamUnixString(date: Date | string | number | null | undefined): string {
  return String(xtreamUnix(date));
}

/** XCIPTV Latest Movies sorts/filters on `added`. Use panel createdAt so TMDB/Plex metadata updates do not hide newly added titles. */
export function xtreamAddedUnix(
  createdAt: Date | string | number | null | undefined,
  updatedAt?: Date | string | number | null
): number {
  const created = xtreamUnix(createdAt);
  if (created > 0) return created;
  return xtreamUnix(updatedAt);
}

/** XCIPTV iterates JSON arrays. Delta/timestamp must still return an array, never a wrapper object. */
export function xtreamDeltaArray<T>(
  payload: T[],
  clientTimestamp: number | null | undefined,
  updatedAt: (item: T) => number
): T[] {
  if (!clientTimestamp || !Number.isFinite(clientTimestamp) || clientTimestamp <= 0) {
    return payload;
  }
  return payload.filter((item) => updatedAt(item) > clientTimestamp);
}

export function xtreamOutputFormats(raw: string | null | undefined): string[] {
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s === "hls" ? "m3u8" : s));
  const out = [...new Set(parts)].filter((s) => s === "m3u8" || s === "ts" || s === "rtmp");
  return out.length ? out : ["ts", "m3u8"];
}

export function xtreamCategoryIds(numericId: string): number[] {
  const n = Number(numericId);
  return Number.isFinite(n) ? [n] : [0];
}

/** XUI / Smarters use string category_id; Nexus expects JSON numbers. */
export function xtreamExportCategoryId(numericId: string): string {
  const raw = String(numericId ?? "").trim();
  return raw || "0";
}

export function xtreamExportCategoryIdValue(
  numericId: string,
  asNumber: boolean
): string | number {
  const raw = String(numericId ?? "").trim() || "0";
  if (!asNumber) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Strip :443/:80 from icon URLs — some Android IPTV grids refuse to render them. */
export function normalizeXtreamStreamIcon(url: unknown): string {
  const u = xtreamSafeText(url);
  if (!u) return "";
  try {
    const parsed = new URL(u.includes("://") ? u : `https://${u}`);
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return u.replace(/:443\//, "/").replace(/:80\//, "/");
  }
}

/** Catalog listings must not embed playback URLs — XCIPTV HTTP-probes every `direct_source`. */
export function xtreamCatalogDirectSource(): string {
  return "";
}

const LISTING_MEDIA_EXT = new Set(["mp4", "mkv", "avi", "mov", "ts", "m4v", "webm", "m3u8"]);

function normalizeListingExt(raw: string | null | undefined): string {
  const v = String(raw ?? "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
  if (!v) return "";
  if (v === "hls") return "m3u8";
  const safe = v.replace(/[^a-z0-9]/g, "");
  return LISTING_MEDIA_EXT.has(safe) ? safe : "";
}

/** File extension from a playback URL (`.mkv`, `.m3u8`, …). */
export function mediaExtensionFromUrl(url?: string | null): string {
  if (!url) return "";
  const path = url.split("?")[0] ?? url;
  const m = path.match(/\.([a-z0-9]{2,4})$/i);
  return m ? normalizeListingExt(m[1]) : "";
}

/**
 * Xtream `container_extension`. Prefer a real file extension from the source URL
 * when the stored field is empty or the generic `mp4` default — XCIPTV/VLC request
 * `/movie/…/id.{ext}` and fail if that does not match the file.
 */
export function xtreamListingExtension(
  containerExtension?: string | null,
  fallback = "mp4",
  streamUrlOrExt?: string | null
): string {
  const fromField = normalizeListingExt(containerExtension);
  const hint = String(streamUrlOrExt ?? "").trim();
  const fromUrl = hint.includes("/") || hint.includes(":")
    ? mediaExtensionFromUrl(hint)
    : normalizeListingExt(hint);
  if (fromUrl && fromUrl !== "m3u8" && (!fromField || fromField === "mp4" || fromField === "m3u8")) {
    return fromUrl;
  }
  return fromField || fromUrl || fallback;
}

export function xmltvSafeText(value: unknown): string {
  return xtreamSafeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** M3U attribute values (tvg-name, group-title) — no quotes or newlines. */
export function xtreamM3uAttr(value: unknown): string {
  return xtreamSafeText(value).replace(/"/g, "'").replace(/[\r\n]+/g, " ");
}

/** HTTP Content-Disposition filename for get.php (blocks header injection). */
export function xtreamM3uFilename(username: unknown): string {
  const base = xtreamSafeText(username).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 64);
  return `${base || "playlist"}.m3u`;
}

export function xtreamBase64(value: unknown): string {
  return Buffer.from(xtreamSafeText(value), "utf8").toString("base64");
}
