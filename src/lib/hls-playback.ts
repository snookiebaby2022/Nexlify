import { Readable } from "node:stream";
import { looksLikeHtmlErrorPayload, openUpstreamLiveStream } from "@/lib/live-upstream-proxy";
import { isPackagerSegmentName } from "@/lib/ts-hls-packager";

const HLS_URL_RE = /\.m3u8(?:[?#]|$)/i;

/** Xtream/nginx HLS playlist type — Smarters ExoPlayer accepts this more reliably than vnd.apple.mpegurl. */
export const HLS_PLAYLIST_CONTENT_TYPE = "application/x-mpegURL";

export function isHlsClientPath(streamId: string): boolean {
  return /\.(m3u8|hls)$/i.test(streamId);
}

export function stripLiveStreamExtension(streamId: string): string {
  return streamId.replace(/\.(ts|m3u8|hls)$/i, "");
}

/** Upstream fetches must not use IPTV Smarters UA — many providers block it (empty/hang). */
export const UPSTREAM_HLS_UA = "VLC/3.0.20 LibVLC/3.0.20";

/**
 * XUI/Xtream: same stream_source, HLS vs MPEGTS is the container suffix.
 * `http://host/live/user/pass/123.ts` → `.m3u8`; extensionless Xtream IDs get `.m3u8` appended.
 */
export function xtreamHlsSourceUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const path = u.pathname;
    if (/\.m3u8$/i.test(path)) return null;
    if (/\.ts$/i.test(path)) {
      u.pathname = path.replace(/\.ts$/i, ".m3u8");
    } else {
      u.pathname = `${path.replace(/\/+$/, "")}.m3u8`;
    }
    const next = u.toString();
    return next === url ? null : next;
  } catch {
    return null;
  }
}

/** Prefer native provider HLS URLs (XUI stream_source + .m3u8) before local TS remux. */
export function expandHlsPlaybackCandidates(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const url of urls) {
    if (isHlsPlaybackUrl(url)) add(url);
  }
  for (const url of urls) {
    const hls = xtreamHlsSourceUrl(url);
    if (hls) add(hls);
  }
  for (const url of urls) add(url);
  return out;
}

export function isHlsPlaybackUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (HLS_URL_RE.test(u)) return true;
  try {
    const parsed = new URL(u);
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return false;
  }
}

export function hlsRelayCacheKey(lineId: string, streamId: string): string {
  return `hls:relay:root:${lineId}:${streamId}`;
}

export function buildHlsRelayUrl(
  _panelOrigin: string,
  username: string,
  password: string,
  streamId: string,
  upstreamUrl: string
): string {
  const token = Buffer.from(upstreamUrl, "utf8").toString("base64url");
  // Path-absolute (XUI/NXT style). Absolute http://IP:... URLs break Smarters when
  // the app logged in via hostname or :8080.
  return `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}/hls/${token}`;
}

function ceilExtinf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

/**
 * Drop tags that freeze ExoPlayer / IPTV Smarters, force HLS v3, and keep
 * TARGETDURATION >= ceil(max EXTINF) (ffmpeg often writes TD 2 with EXTINF 2.04).
 */
export function sanitizeHlsPlaylist(body: string): string {
  const kept: string[] = [];
  let maxExtinf = 0;
  let sawVersion = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.startsWith("#EXT-X-DISCONTINUITY")) continue;
    if (t.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) continue;
    if (t.startsWith("#EXT-X-VERSION")) {
      if (sawVersion) continue;
      sawVersion = true;
      kept.push("#EXT-X-VERSION:3");
      continue;
    }
    const inf = t.match(/^#EXTINF:(-?[0-9.]+)/i);
    if (inf) {
      const n = Number(inf[1]);
      if (Number.isFinite(n) && n > 0 && n > maxExtinf) maxExtinf = n;
    }
    kept.push(line);
  }
  const minTd = ceilExtinf(maxExtinf);
  let hasTd = false;
  const out = kept.map((line) => {
    const t = line.trim();
    if (!t.startsWith("#EXT-X-TARGETDURATION")) return line;
    hasTd = true;
    const cur = Number(t.split(":")[1]);
    const td = Number.isFinite(cur) ? Math.max(cur, minTd) : minTd;
    return `#EXT-X-TARGETDURATION:${td}`;
  });
  if (!sawVersion) {
    const i = out.findIndex((l) => l.trim() === "#EXTM3U");
    if (i >= 0) out.splice(i + 1, 0, "#EXT-X-VERSION:3");
    else out.unshift("#EXTM3U", "#EXT-X-VERSION:3");
  }
  if (!hasTd && maxExtinf > 0) {
    const i = out.findIndex((l) => l.trim().startsWith("#EXT-X-VERSION"));
    out.splice(i >= 0 ? i + 1 : 1, 0, `#EXT-X-TARGETDURATION:${minTd}`);
  }
  return out.join("\n");
}

/**
 * When the panel IP is blocked (empty HTML 200) but XUI stored a real .m3u8,
 * hand the provider playlist URL to the player so it fetches from the client IP.
 */
export function buildClientDirectHlsMaster(hlsUrl: string): string {
  const url = hlsUrl.trim();
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-STREAM-INF:BANDWIDTH=8000000",
    url,
    "",
  ].join("\n");
}

/** 404 means this host has no HLS container — do not send the player there. */
export function shouldOfferClientDirectHls(status: number, detail?: string): boolean {
  if (status === 404 || status === 410 || status === 405) return false;
  const d = (detail ?? "").toLowerCase();
  if (/\bhttp 404\b/.test(d) || /\bhttp 410\b/.test(d)) return false;
  return true;
}

export function rewritePackagerPlaylist(
  body: string,
  _panelOrigin: string,
  username: string,
  password: string,
  streamId: string
): string {
  const prefix = `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}/hls/`;
  return sanitizeHlsPlaylist(body)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const name = trimmed.split(/[\\/]/).pop() ?? trimmed;
      if (!isPackagerSegmentName(name)) return line;
      return `${prefix}${name}`;
    })
    .join("\n");
}

/** Block SSRF — only public http(s) targets. */
export function isSafeUpstreamUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAllowedHlsRelayTarget(target: string, _rootUpstream = ""): boolean {
  // Line auth is required to hit the relay; block only private/local SSRF targets.
  return isSafeUpstreamUrl(target);
}

/** Rewrite playlist lines so segments and sub-playlists go through the panel relay. */
export function rewriteHlsManifestForRelay(
  body: string,
  manifestUrl: string,
  relay: (absoluteUrl: string) => string
): string {
  const base = new URL(manifestUrl);
  return sanitizeHlsPlaylist(body)
    .split("\n")
    .map((line) => {
      const out = line.replace(/URI="([^"]+)"/gi, (_match: string, uri: string) => {
        try {
          return `URI="${relay(new URL(uri, base).href)}"`;
        } catch {
          return line;
        }
      });
      const trimmed = out.trim();
      if (!trimmed || trimmed.startsWith("#")) return out;
      try {
        return relay(new URL(trimmed, base).href);
      } catch {
        return out;
      }
    })
    .join("\n");
}

/** @deprecated Use rewriteHlsManifestForRelay — kept for tests */
export function rewriteHlsManifest(body: string, manifestUrl: string): string {
  const base = new URL(manifestUrl);
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      try {
        return new URL(trimmed, base).href;
      } catch {
        return line;
      }
    })
    .join("\n");
}

export type HlsFetchResult =
  | { ok: true; kind: "manifest"; body: string; finalUrl: string }
  | { ok: true; kind: "segment"; body: ArrayBuffer; contentType: string; finalUrl: string }
  | { ok: false; status: number; detail?: string };

async function readReadableLimited(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= maxBytes) break;
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchHlsUpstream(
  upstreamUrl: string,
  userAgent?: string,
  range?: string | null,
  timeoutMs = 20_000
): Promise<HlsFetchResult> {
  try {
    const extra: Record<string, string> = {};
    if (range) extra.Range = range;
    const open = await openUpstreamLiveStream(upstreamUrl, {
      userAgent: userAgent?.trim() || UPSTREAM_HLS_UA,
      timeoutMs,
      headers: extra,
    });
    const finalUrl = open.finalUrl || upstreamUrl;
    const contentType = open.contentType ?? "";
    const buf = await readReadableLimited(open.body, 16_000_000);
    if (!buf.length) {
      return { ok: false, status: 502, detail: "empty upstream body" };
    }
    if (looksLikeHtmlErrorPayload(buf)) {
      return { ok: false, status: 502, detail: "html error page" };
    }
    const head = buf.subarray(0, Math.min(buf.length, 16)).toString("utf8").trimStart();
    if (head.startsWith("#EXT")) {
      return { ok: true, kind: "manifest", body: buf.toString("utf8"), finalUrl };
    }

    return {
      ok: true,
      kind: "segment",
      body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      contentType: contentType || "video/mp2t",
      finalUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    const status = /timeout/i.test(msg) ? 504 : /HTTP (\d+)/.test(msg) ? Number(RegExp.$1) : 502;
    return { ok: false, status, detail: msg };
  }
}

export async function fetchHlsManifestForClient(
  upstreamUrl: string,
  userAgent?: string,
  timeoutMs = 20_000
): Promise<
  { ok: true; body: string; finalUrl: string } | { ok: false; status: number; detail?: string }
> {
  const res = await fetchHlsUpstream(upstreamUrl, userAgent?.trim() || UPSTREAM_HLS_UA, null, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, detail: res.detail };
  if (res.kind !== "manifest") return { ok: false, status: 502, detail: "not an HLS playlist" };
  return { ok: true, body: res.body, finalUrl: res.finalUrl };
}

/**
 * When upstream is native MPEG-TS but the app requests `.m3u8` (Smarters HLS output),
 * serve an event-style playlist that points at the panel `.ts` URL — not raw TS bytes.
 * Uses EXTINF:-1 (continuous live TS). Finite EXTINF breaks Smarters HLS mode entirely.
 */
export function buildNativeTsHlsManifest(
  _panelOrigin: string,
  username: string,
  password: string,
  streamId: string
): string {
  const tsUrl = `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}.ts`;
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
    "#EXTINF:-1,",
    tsUrl,
    "",
  ].join("\n");
}
