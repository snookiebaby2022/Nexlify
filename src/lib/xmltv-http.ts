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
 * HTTP Content-Encoding gzip breaks XCIPTV's XML parser (including okhttp / empty UAs).
 * Only `type=gzip` is an Xtream gzip *file* body, not Content-Encoding.
 */
export function shouldGzipXmltv(
  _acceptEncoding: string,
  _userAgent: string,
  typeParam?: string | null
): boolean {
  return xmltvWantsGzipFile(typeParam);
}
