import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;
const PEEK_BYTES = 512;

export type UpstreamOpenResult = {
  status: number;
  contentType: string;
  body: Readable;
  finalUrl: string;
  headers: Record<string, string>;
};

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Reject HTML/JSON error pages that some CDNs return as HTTP 200. */
export function isPlayableUpstreamContentType(contentType: string | undefined | null): boolean {
  const c = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (!c || c === "application/octet-stream" || c === "binary/octet-stream") return true;
  if (c.includes("video/") || c.includes("audio/")) return true;
  if (c.includes("mp2t") || c.includes("mpegurl") || c.includes("m3u8")) return true;
  if (c.includes("application/x-mpegurl") || c.includes("application/vnd.apple.mpegurl")) return true;
  if (c.startsWith("text/") || c.includes("json") || c.includes("xml") || c.includes("html")) return false;
  return true;
}

/** MPEG-TS sync (0x47) at packet boundaries, or common container magic — even when CT lies. */
export function looksLikePlayableMediaPayload(buf: Buffer): boolean {
  if (!buf.length) return false;
  // MPEG-TS: sync byte 0x47 every 188 bytes
  if (buf[0] === 0x47) {
    let syncHits = 1;
    for (let i = 188; i + 1 < buf.length; i += 188) {
      if (buf[i] === 0x47) syncHits++;
      else break;
    }
    if (syncHits >= 2 || buf.length < 188) return true;
  }
  // ISO BMFF / MP4 / fMP4
  if (buf.length >= 8) {
    const box = buf.subarray(4, 8).toString("ascii");
    if (box === "ftyp" || box === "moof" || box === "styp" || box === "mdat") return true;
  }
  // Matroska / WebM
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  // ID3-tagged audio or MPEG ADTS
  if (buf.subarray(0, 3).toString("ascii") === "ID3") return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // HLS playlist text
  const head = buf.subarray(0, Math.min(buf.length, 64)).toString("utf8");
  if (head.includes("#EXTM3U")) return true;
  return false;
}

export function looksLikeHlsManifestPayload(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 64)).toString("utf8");
  return head.includes("#EXTM3U");
}

export function shouldSniffAccidentalHlsManifest(contentType: string | undefined | null): boolean {
  const c = (contentType ?? "").toLowerCase();
  if (c.includes("mpegurl") || c.includes("m3u8")) return true;
  if (c.includes("mp2t") || c.startsWith("video/") || c.startsWith("audio/")) return false;
  return true;
}

/** ExoPlayer / VLC / Smarters: live .ts must be MPEG-TS, not text/html from a lying CDN. */
export function normalizeLiveMpegTsContentType(contentType: string | undefined | null): string {
  const c = (contentType ?? "").toLowerCase();
  if (c.includes("mpegurl") || c.includes("m3u8")) return "application/x-mpegURL";
  if (c.includes("mp2t")) return "video/mp2t";
  if (c.startsWith("video/") || c.startsWith("audio/")) {
    return (contentType ?? "video/mp2t").split(";")[0]!.trim();
  }
  return "video/mp2t";
}

export function normalizeHlsManifestContentType(_contentType?: string | null): string {
  return "application/x-mpegURL";
}

const LIVE_TS_STRIP_HEADERS = new Set([
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
]);

/**
 * VLC (and XCIPTV's VLC decoder) stalls or refuses live MPEG-TS when the
 * response advertises byte ranges or a finite Content-Length. ExoPlayer ignores
 * those headers; VLC sends Range: bytes=0- and then fails on 200/206 mismatch.
 */
export function liveMpegTsResponseHeaders(
  contentType?: string | null,
  extra?: Record<string, string>
): Record<string, string> {
  const normalized = normalizeLiveMpegTsContentType(contentType);
  const headers: Record<string, string> = {
    "Content-Type": normalized.includes("mpegurl") ? "video/mp2t" : normalized,
    "Cache-Control": "no-cache, no-store, no-transform",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive",
    "Accept-Ranges": "none",
    "X-Accel-Buffering": "no",
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (LIVE_TS_STRIP_HEADERS.has(key.toLowerCase())) continue;
      if (key.toLowerCase() === "content-type") continue;
      headers[key] = value;
    }
  }
  return headers;
}

export function looksLikeHtmlErrorPayload(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 256)).toString("utf8").trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.includes("<html") ||
    head.startsWith("{") // JSON error bodies
  );
}

function nodeToWebStream(nodeStream: Readable, cleanup?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
      nodeStream.on("error", (err) => {
        cleanup?.();
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      cleanup?.();
      nodeStream.destroy();
    },
  });
}

function prependBuffer(prefix: Buffer, stream: Readable): Readable {
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

function peekResponseBody(
  res: Readable,
  maxBytes: number
): Promise<{ prefix: Buffer; rest: Readable }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      res.removeListener("data", onData);
      res.removeListener("end", onEnd);
      res.removeListener("error", onError);
      const prefix = Buffer.concat(chunks, total);
      resolve({ prefix, rest: res });
    };

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) finish();
    };
    const onEnd = () => finish();
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    res.on("data", onData);
    res.once("end", onEnd);
    res.once("error", onError);
  });
}

/**
 * Open an upstream live URL with Node http(s) (not Next.js patched fetch).
 * Cloudflare/auth CDNs often return empty HTML via undici/fetch inside Next route handlers.
 * Some providers also label MPEG-TS as text/html — we sniff the payload before rejecting.
 */
export function openUpstreamLiveStream(
  url: string,
  opts?: { userAgent?: string; timeoutMs?: number; headers?: Record<string, string> }
): Promise<UpstreamOpenResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ua =
    opts?.userAgent?.trim() ||
    "Mozilla/5.0 (compatible; Nexlify/1.0; +https://nexlify.live)";

  const visit = (current: string, redirectsLeft: number): Promise<UpstreamOpenResult> =>
    new Promise((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        reject(new Error("Invalid upstream URL"));
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        reject(new Error("Unsupported upstream protocol"));
        return;
      }

      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const headers: Record<string, string> = {
        "User-Agent": ua,
        Accept: "*/*",
        Connection: "keep-alive",
        ...(opts?.headers ?? {}),
      };

      const reqOpts: http.RequestOptions & https.RequestOptions = {
        method: "GET",
        headers,
        timeout: timeoutMs,
      };
      // Dual-stack: try IPv4 first via lookup order, but do not force family:4
      // (some CDNs return empty HTML challenges on forced-v4 paths).
      if (isHttps) {
        (reqOpts as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = lib.request(current, reqOpts, (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (isRedirect(status) && location && redirectsLeft > 0) {
          res.resume();
          let nextUrl: string;
          try {
            nextUrl = new URL(location, current).toString();
          } catch {
            reject(new Error("Invalid redirect location"));
            return;
          }
          resolve(visit(nextUrl, redirectsLeft - 1));
          return;
        }

        // Some CDNs return HTTP 200 text/html with a Location-like body or empty page
        // instead of a proper 302 — treat as failure so backup failover can run.
        const contentType = String(res.headers["content-type"] ?? "application/octet-stream");
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Upstream HTTP ${status}`));
          return;
        }

        if (isPlayableUpstreamContentType(contentType)) {
          const passHeaders: Record<string, string> = {};
          for (const key of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
            const value = res.headers[key];
            if (typeof value === "string" && value) passHeaders[key] = value;
          }
          resolve({
            status,
            contentType,
            body: res,
            finalUrl: current,
            headers: passHeaders,
          });
          return;
        }

        // Suspicious CT (text/html etc.): sniff first bytes — many IPTV CDNs lie.
        void peekResponseBody(res, PEEK_BYTES)
          .then(({ prefix, rest }) => {
            if (looksLikePlayableMediaPayload(prefix)) {
              resolve({
                status,
                contentType: "application/octet-stream",
                body: prependBuffer(prefix, rest),
                finalUrl: current,
                headers: {},
              });
              return;
            }
            rest.resume();
            if (looksLikeHtmlErrorPayload(prefix) || prefix.length === 0) {
              reject(new Error(`Non-playable content-type: ${contentType}`));
              return;
            }
            reject(new Error(`Non-playable content-type: ${contentType}`));
          })
          .catch(reject);
      });

      req.on("timeout", () => {
        req.destroy(new Error("Upstream timeout"));
      });
      req.on("error", reject);
      req.end();
    });

  return visit(url, MAX_REDIRECTS);
}

export function upstreamToWebResponse(
  open: UpstreamOpenResult,
  extraHeaders?: Record<string, string>,
  opts?: { liveUnbounded?: boolean }
): { stream: ReadableStream<Uint8Array>; headers: Record<string, string> } {
  if (opts?.liveUnbounded) {
    return {
      stream: nodeToWebStream(open.body),
      headers: liveMpegTsResponseHeaders(open.contentType, extraHeaders),
    };
  }
  const headers: Record<string, string> = {
    "Content-Type": normalizeLiveMpegTsContentType(open.contentType),
    "Cache-Control": "no-cache, no-store",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive",
    ...(open.headers ?? {}),
    ...(extraHeaders ?? {}),
  };
  return {
    stream: nodeToWebStream(open.body),
    headers,
  };
}

export async function resolvePlayableUpstreamUrl(
  url: string,
  opts?: { userAgent?: string; timeoutMs?: number }
): Promise<string | null> {
  let body: Readable | undefined;
  try {
    const open = await openUpstreamLiveStream(url, {
      userAgent: opts?.userAgent,
      timeoutMs: opts?.timeoutMs ?? 8_000,
    });
    body = open.body;
    const ct = open.contentType.toLowerCase();
    open.body.destroy();
    if (ct.includes("html") && !ct.includes("mpegurl")) return null;
    if (ct.includes("json") || ct.includes("xml")) return null;
    return open.finalUrl || url;
  } catch {
    try {
      body?.destroy();
    } catch {
      /* ignore */
    }
    return null;
  }
}

export type UpstreamMediaKind = "hls" | "media" | "none";

/** Cheap GET+sniff so we do not spawn ffmpeg on empty HTML / 404 pages. */
export async function probeUpstreamPlayable(
  url: string,
  opts?: { userAgent?: string; timeoutMs?: number }
): Promise<UpstreamMediaKind> {
  let body: Readable | undefined;
  try {
    const open = await openUpstreamLiveStream(url, {
      userAgent: opts?.userAgent,
      timeoutMs: opts?.timeoutMs ?? 4_000,
    });
    body = open.body;
    const ct = open.contentType.toLowerCase();
    if (ct.includes("mpegurl") || ct.includes("m3u8")) {
      open.body.destroy();
      return "hls";
    }
    if (ct.includes("video/") || ct.includes("mp2t") || ct.includes("mpegts") || ct.includes("octet-stream")) {
      open.body.destroy();
      return "media";
    }
    const { prefix } = await peekResponseBody(open.body, PEEK_BYTES);
    open.body.destroy();
    const head = prefix.subarray(0, Math.min(prefix.length, 64)).toString("utf8");
    if (head.includes("#EXTM3U")) return "hls";
    if (looksLikePlayableMediaPayload(prefix)) return "media";
    return "none";
  } catch {
    try {
      body?.destroy();
    } catch {
      /* ignore */
    }
    return "none";
  }
}
