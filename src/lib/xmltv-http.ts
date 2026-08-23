const IPTV_XMLTV_UA = /xciptv|smarters|tivimate|perfect player|gse iptv|iptv smarters/i;

/** Xtream `xmltv.php?type=gzip` — body is a .gz file, not HTTP Content-Encoding. */
export function xmltvWantsGzipFile(typeParam?: string | null): boolean {
  const t = (typeParam ?? "").trim().toLowerCase();
  return t === "gzip" || t === "gz";
}

/** Never force-gzip IPTV apps; they often cannot decode Content-Encoding: gzip. */
export function shouldGzipXmltv(
  acceptEncoding: string,
  userAgent: string,
  typeParam?: string | null
): boolean {
  if (xmltvWantsGzipFile(typeParam)) return true;
  if (IPTV_XMLTV_UA.test(userAgent)) return false;
  return /\bgzip\b/i.test(acceptEncoding);
}
