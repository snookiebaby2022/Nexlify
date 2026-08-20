import { gunzipSync } from "zlib";
import http from "node:http";
import https from "node:https";
import type { StreamProxy } from "@prisma/client";
import { proxyUrl } from "@/lib/proxy";

const EPG_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (compatible; NexlifyPanel/1.0; +https://github.com/iptv-org/epg)",
  Accept: "application/xml, text/xml, application/gzip, */*",
  // Omit br — we only decode gzip; brotli bodies fail parse on many custom EPG hosts.
  "Accept-Encoding": "gzip, deflate",
};

type EpgFetchResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: Buffer;
};

function isGzip(buf: Buffer, url: string, contentType: string | null): boolean {
  if (url.toLowerCase().endsWith(".gz")) return true;
  if (contentType?.includes("gzip")) return true;
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Per-request TLS skip for EPG sources with expired certs — does not change process.env. */
function fetchEpgOnce(
  url: string,
  extraHeaders: Record<string, string>,
  timeoutMs: number,
  redirectsLeft: number
): Promise<EpgFetchResult> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error("Invalid EPG URL"));
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reject(new Error("EPG URL must be http or https"));
      return;
    }

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: { ...EPG_HEADERS, ...extraHeaders },
        timeout: timeoutMs,
        ...(parsed.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          res.resume();
          try {
            const next = new URL(location, url).toString();
            resolve(fetchEpgOnce(next, extraHeaders, timeoutMs, redirectsLeft - 1));
          } catch {
            reject(new Error("Invalid EPG redirect"));
          }
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            ok: status >= 200 && status < 300,
            status,
            contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("EPG fetch timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchOnce(
  url: string,
  proxy: Pick<StreamProxy, "type" | "host" | "port" | "username" | "password"> | null
): Promise<string> {
  const extra: Record<string, string> = {};
  if (proxy) extra["X-Nexlify-Proxy"] = proxyUrl(proxy);

  const res = await fetchEpgOnce(url, extra, 120_000, 5);

  if (!res.ok) {
    const hint =
      res.status === 403
        ? " — server blocked the request (try without proxy or use xtream-masters guide URL)"
        : res.status === 404
          ? " — URL not found (the EPG guide may have moved; try a different URL or .xml.gz extension)"
          : "";
    throw new Error(`EPG fetch failed: HTTP ${res.status}${hint}`);
  }

  const buf = res.body;
  if (!buf.length) throw new Error("EPG fetch failed: empty response");

  let xml: string;
  try {
    xml = isGzip(buf, url, res.contentType)
      ? gunzipSync(buf).toString("utf8")
      : buf.toString("utf8");
  } catch {
    throw new Error("EPG fetch failed: could not decode XML (invalid gzip or encoding)");
  }

  if (!/<programme[\s>]/i.test(xml)) {
    throw new Error(
      "EPG fetch failed: response is not valid XMLTV (missing <programme> entries — channel-only guides cannot sync)"
    );
  }

  return xml;
}

/** Fetch XMLTV guide; retries without proxy if proxy fetch fails. */
export async function fetchEpgXml(
  url: string,
  proxy?: Pick<StreamProxy, "type" | "host" | "port" | "username" | "password"> | null
): Promise<string> {
  const attempts: (typeof proxy | null)[] = proxy ? [null, proxy] : [null];
  let lastErr: Error | null = null;

  for (const p of attempts) {
    try {
      return await fetchOnce(url, p ?? null);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastErr ?? new Error("EPG fetch failed");
}
