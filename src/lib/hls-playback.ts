import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import {
  looksLikeHtmlErrorPayload,
  openUpstreamLiveStream,
  type UpstreamOpenResult,
} from "@/lib/live-upstream-proxy";
import { isPackagerSegmentName } from "@/lib/ts-hls-packager";
import { isPrivateOrReservedIp } from "@/lib/ssrf";

const HLS_URL_RE = /\.m3u8(?:[?#]|$)/i;

/** Xtream/nginx HLS playlist type — Smarters ExoPlayer accepts this more reliably than vnd.apple.mpegurl. */
export const HLS_PLAYLIST_CONTENT_TYPE = "application/x-mpegURL";

/** Cold probe for provider .m3u8; warm path uses playlist cache + shorter timeout. */
export const HLS_NATIVE_PROBE_MS = 1_200;
export const HLS_NATIVE_PROBE_WARM_MS = 600;
export const HLS_GUESSED_PROBE_MS = 500;
/** Rewritten live playlist TTL — Exo/VLC poll every 2–4s; cache avoids upstream round-trip. */
export const HLS_PLAYLIST_CACHE_SEC = 6;

export function hlsNativeUrlCacheKey(streamId: string): string {
  return `hls:native:url:${streamId}`;
}

export function hlsPlaylistCacheKey(lineId: string, streamId: string): string {
  return `hls:playlist:${lineId}:${streamId}`;
}

/**
 * Finite HLS segments: never 206 without Content-Range. VLC refuses that combo;
 * ExoPlayer is lenient which is why MPEG-TS/HLS looked "fine" only on Exo.
 */
export function hlsMediaSegmentHttp(
  byteLength: number,
  contentType?: string
): {
  status: number;
  headers: Record<string, string>;
} {
  return {
    status: 200,
    headers: hlsSegmentResponseHeaders(contentType, byteLength),
  };
}

/** Native HLS segment headers — preserve fmp4/mp2t; ExoPlayer wants 200 + Content-Length. */
export function hlsSegmentResponseHeaders(
  contentType?: string,
  byteLength?: number
): Record<string, string> {
  let ct = (contentType ?? "video/mp2t").split(";")[0]!.trim() || "video/mp2t";
  if (ct.includes("mpegurl") || ct.includes("m3u8")) ct = "video/mp2t";
  const headers: Record<string, string> = {
    "Content-Type": ct,
    "Cache-Control": "no-cache, no-store",
    "Accept-Ranges": "none",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (byteLength != null && byteLength > 0) {
    headers["Content-Length"] = String(byteLength);
  }
  return headers;
}

export function isHlsClientPath(streamId: string): boolean {
  return /\.(m3u8|hls)$/i.test(streamId);
}

export function stripLiveStreamExtension(streamId: string): string {
  return streamId.replace(/\.(ts|m3u8|hls|mp4|mkv|avi|mov|webm)$/i, "");
}

/**
 * Instant live HLS: one EVENT playlist whose only fragment is the panel MPEG-TS
 * splice. Players start in milliseconds instead of waiting on ffmpeg.
 */
export function instantLiveTsHlsPlaylist(tsUri: string): string {
  const uri = tsUri.trim() || "stream.ts";
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
    "#EXTINF:6.000,",
    uri,
    "",
  ].join("\n");
}

/** Instant VOD HLS pointing at the progressive file (mp4/mkv) next to the playlist. */
export function instantVodFileHlsPlaylist(fileUri: string, durationSec = 28_800): string {
  const uri = fileUri.trim() || "video.mp4";
  const dur = Math.max(1, Math.round(durationSec));
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${dur}`,
    `#EXTINF:${dur}.000,`,
    uri,
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");
}

/** Same-origin HLS URL when a player requested MPEG-TS for an HLS source. */
export function rewriteLivePathToHls(requestUrl: string): string {
  const u = new URL(requestUrl);
  const segs = u.pathname.split("/");
  const last = segs[segs.length - 1] || "";
  segs[segs.length - 1] = `${stripLiveStreamExtension(decodeURIComponent(last))}.m3u8`;
  u.pathname = segs.join("/");
  u.search = "";
  u.hash = "";
  return u.toString();
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
/** VOD playlists start faster in ExoPlayer/VLC when tagged as VOD (do not use on live). */
export function markHlsPlaylistAsVod(body: string): string {
  const sanitized = sanitizeHlsPlaylist(body);
  if (/#EXT-X-PLAYLIST-TYPE:/i.test(sanitized)) return sanitized;
  return sanitized.replace(/#EXT-X-VERSION:3/, "#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD");
}

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
  if (status === 404 || status === 405 || status === 407 || status === 410) return false;
  const d = (detail ?? "").toLowerCase();
  if (/\bhttp 404\b/.test(d) || /\bhttp 407\b/.test(d) || /\bhttp 410\b/.test(d)) return false;
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
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal" ||
      host === "metadata"
    ) {
      return false;
    }
    if (isPrivateOrReservedIp(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * XUI.one "direct" playback: after line auth, send the player to stream_source.
 * VLC/XCIPTV follow 302; Node must not carry the live bitrate.
 */
export function xuiDirectSourceLocation(url: string): string | null {
  const t = url.trim();
  if (!t || !isSafeUpstreamUrl(t)) return null;
  return t;
}

export function isAllowedHlsRelayTarget(target: string, rootUpstream = ""): boolean {
  if (!isSafeUpstreamUrl(target)) return false;
  const root = rootUpstream.trim();
  if (!root) return true;
  try {
    return new URL(target).hostname.toLowerCase() === new URL(root).hostname.toLowerCase();
  } catch {
    return false;
  }
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
  | { ok: true; kind: "segment-stream"; open: UpstreamOpenResult; finalUrl: string }
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

function prependReadable(prefix: Buffer, stream: Readable): Readable {
  if (!prefix.length) return stream;
  return Readable.from(
    (async function* () {
      yield prefix;
      for await (const chunk of stream) {
        yield chunk;
      }
    })()
  );
}

async function peekReadable(stream: Readable, maxBytes: number): Promise<{ prefix: Buffer; rest: Readable }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (total + buf.length <= maxBytes) {
      chunks.push(buf);
      total += buf.length;
      continue;
    }
    const need = maxBytes - total;
    chunks.push(buf.subarray(0, need));
    return {
      prefix: Buffer.concat(chunks),
      rest: prependReadable(buf.subarray(need), stream),
    };
  }
  return { prefix: Buffer.concat(chunks), rest: Readable.from([]) };
}

function nodeStreamToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
      nodeStream.on("error", (err) => {
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/** Stream a native HLS segment without buffering the full file (lower latency for ExoPlayer). */
export function hlsSegmentStreamResponse(open: UpstreamOpenResult): {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
} {
  const cl = open.headers["content-length"];
  const len = cl ? Number(cl) : undefined;
  return {
    stream: nodeStreamToWeb(open.body),
    headers: hlsSegmentResponseHeaders(open.contentType, Number.isFinite(len) ? len : undefined),
  };
}

export async function fetchHlsUpstream(
  upstreamUrl: string,
  userAgent?: string,
  _range?: string | null,
  timeoutMs = 20_000,
  proxy?: import("@/lib/outbound-proxy").OutboundProxy | null
): Promise<HlsFetchResult> {
  try {
    const open = await openUpstreamLiveStream(upstreamUrl, {
      userAgent: userAgent?.trim() || UPSTREAM_HLS_UA,
      timeoutMs,
      proxy,
    });
    const finalUrl = open.finalUrl || upstreamUrl;
    const contentType = open.contentType ?? "";
    const ct = contentType.toLowerCase();
    const likelyManifest = isHlsPlaybackUrl(upstreamUrl) || ct.includes("mpegurl") || ct.includes("m3u8");

    if (!likelyManifest) {
      return { ok: true, kind: "segment-stream", open, finalUrl };
    }

    const { prefix, rest } = await peekReadable(open.body, 512);
    if (looksLikeHtmlErrorPayload(prefix)) {
      rest.destroy();
      return { ok: false, status: 502, detail: "html error page" };
    }
    const head = prefix.toString("utf8").trimStart();
    if (!head.startsWith("#EXT")) {
      return {
        ok: true,
        kind: "segment-stream",
        open: { ...open, body: prependReadable(prefix, rest) },
        finalUrl,
      };
    }

    const tail = await readReadableLimited(rest, 512_000);
    const buf = Buffer.concat([prefix, tail]);
    if (!buf.length) {
      return { ok: false, status: 502, detail: "empty upstream body" };
    }
    return { ok: true, kind: "manifest", body: buf.toString("utf8"), finalUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    const status = /timeout/i.test(msg) ? 504 : /HTTP (\d+)/.test(msg) ? Number(RegExp.$1) : 502;
    return { ok: false, status, detail: msg };
  }
}

export async function fetchHlsManifestForClient(
  upstreamUrl: string,
  userAgent?: string,
  timeoutMs = 20_000,
  proxy?: import("@/lib/outbound-proxy").OutboundProxy | null
): Promise<
  { ok: true; body: string; finalUrl: string } | { ok: false; status: number; detail?: string }
> {
  const res = await fetchHlsUpstream(upstreamUrl, userAgent?.trim() || UPSTREAM_HLS_UA, null, timeoutMs, proxy);
  if (!res.ok) return { ok: false, status: res.status, detail: res.detail };
  if (res.kind !== "manifest") return { ok: false, status: 502, detail: "not an HLS playlist" };
  return { ok: true, body: res.body, finalUrl: res.finalUrl };
}

/** Probe multiple HLS URLs in parallel — first success wins (faster live zap). */
export async function raceHlsManifestProbes(
  urls: string[],
  userAgent: string,
  probeMsForUrl: (url: string) => number,
  proxy?: import("@/lib/outbound-proxy").OutboundProxy | null
): Promise<{ playbackUrl: string; body: string; finalUrl: string } | null> {
  if (!urls.length) return null;
  return new Promise((resolve) => {
    let failures = 0;
    for (const url of urls) {
      void fetchHlsManifestForClient(url, userAgent, probeMsForUrl(url), proxy).then((manifest) => {
        if (manifest.ok) {
          resolve({ playbackUrl: url, body: manifest.body, finalUrl: manifest.finalUrl });
          return;
        }
        failures++;
        if (failures >= urls.length) resolve(null);
      });
    }
  });
}

/** Fast VOD HLS: rewrite a native provider playlist; otherwise package via the HLS daemon. */
export async function buildClientVodHlsPlaylist(opts: {
  playbackUrl: string;
  panelOrigin: string;
  username: string;
  password: string;
  streamKey: string;
  diskStreamId: string;
}): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  if (isHlsPlaybackUrl(opts.playbackUrl)) {
    const manifest = await fetchHlsManifestForClient(opts.playbackUrl, UPSTREAM_HLS_UA, 2_500);
    if (manifest.ok) {
      const relay = (url: string) =>
        buildHlsRelayUrl(opts.panelOrigin, opts.username, opts.password, opts.streamKey, url);
      return {
        ok: true,
        body: markHlsPlaylistAsVod(rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay)),
      };
    }
  }
  const { ensureDiskHls } = await import("@/lib/hls-restream-client");
  const packed = await ensureDiskHls({
    streamId: opts.diskStreamId,
    upstreamUrl: opts.playbackUrl,
    userAgent: UPSTREAM_HLS_UA,
    vod: true,
  });
  if (!packed.ok) return packed;
  return {
    ok: true,
    body: markHlsPlaylistAsVod(
      rewritePackagerPlaylist(packed.playlist, opts.panelOrigin, opts.username, opts.password, opts.streamKey)
    ),
  };
}
