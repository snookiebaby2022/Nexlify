import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

export type UpstreamOpenResult = {
  status: number;
  contentType: string;
  body: Readable;
  finalUrl: string;
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

/**
 * Open an upstream live URL with Node http(s) (not Next.js patched fetch).
 * Cloudflare/auth CDNs often return empty HTML via undici/fetch inside Next route handlers.
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
        // Prefer IPv4 when dual-stack hosts flake on AAAA
        family: 4,
      };
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

          const contentType = String(res.headers["content-type"] ?? "application/octet-stream");
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`Upstream HTTP ${status}`));
            return;
          }
          if (!isPlayableUpstreamContentType(contentType)) {
            res.resume();
            reject(new Error(`Non-playable content-type: ${contentType}`));
            return;
          }

          resolve({
            status,
            contentType,
            body: res,
            finalUrl: current,
          });
        }
      );

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
  extraHeaders?: Record<string, string>
): { stream: ReadableStream<Uint8Array>; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    "Content-Type": open.contentType.includes("html") ? "video/mp2t" : open.contentType,
    "Cache-Control": "no-cache, no-store",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive",
    ...(extraHeaders ?? {}),
  };
  return {
    stream: nodeToWebStream(open.body),
    headers,
  };
}
