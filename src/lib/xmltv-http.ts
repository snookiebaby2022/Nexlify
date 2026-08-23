/** Same hash as `cuidToNum` — kept local so this module stays Prisma-free. */
function numericStreamId(streamCuid: string): string {
  let h = 0;
  for (let i = 0; i < streamCuid.length; i++) {
    h = ((h << 5) - h + streamCuid.charCodeAt(i)) | 0;
  }
  return String(Math.abs(h));
}

/** XCIPTV matches xmltv `<channel id>` to epg_channel_id and/or numeric stream_id. */
export function xmltvChannelIds(epgId: string, streamCuid: string, extraId?: string | null): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  add(epgId);
  add(extraId ?? "");
  if (streamCuid) add(numericStreamId(streamCuid));
  return ids;
}

/** Xtream `xmltv.php?type=gzip` — body is a .gz file, not HTTP Content-Encoding. */
export function xmltvWantsGzipFile(typeParam?: string | null): boolean {
  const t = (typeParam ?? "").trim().toLowerCase();
  return t === "gzip" || t === "gz";
}

/**
 * Gzip xmltv when the client asks (OkHttp/XCIPTV/Smarters). `type=gzip` is a file body.
 * Nginx must not gzip xml (`gzip off` / no xml gzip_types) or the body is double-compressed.
 */
export function shouldGzipXmltv(
  acceptEncoding: string,
  _userAgent: string,
  typeParam?: string | null
): boolean {
  if (xmltvWantsGzipFile(typeParam)) return true;
  return /\bgzip\b/i.test(acceptEncoding);
}
