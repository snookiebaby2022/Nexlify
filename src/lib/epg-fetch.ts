import { gunzipSync } from "zlib";
import type { StreamProxy } from "@prisma/client";
import { fetchWithOptionalProxy } from "@/lib/proxy";

const EPG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; NexlifyPanel/1.0; +https://github.com/iptv-org/epg)",
  Accept: "application/xml, text/xml, application/gzip, */*",
  "Accept-Encoding": "gzip, deflate, br",
};

function isGzip(buf: Buffer, url: string, contentType: string | null): boolean {
  if (url.toLowerCase().endsWith(".gz")) return true;
  if (contentType?.includes("gzip")) return true;
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

async function fetchOnce(
  url: string,
  proxy: Pick<StreamProxy, "type" | "host" | "port" | "username" | "password"> | null
): Promise<string> {
  const res = await fetchWithOptionalProxy(url, proxy, {
    headers: EPG_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const hint =
      res.status === 403
        ? " — server blocked the request (try without proxy or use xtream-masters guide URL)"
        : res.status === 404
          ? " — URL not found (the EPG guide may have moved; try a different URL or .xml.gz extension)"
          : "";
    throw new Error(`EPG fetch failed: HTTP ${res.status}${hint}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("EPG fetch failed: empty response");

  let xml: string;
  try {
    xml = isGzip(buf, url, res.headers.get("content-type"))
      ? gunzipSync(buf).toString("utf8")
      : buf.toString("utf8");
  } catch {
    throw new Error("EPG fetch failed: could not decode XML (invalid gzip or encoding)");
  }

  if (!/<programme[\s>]/i.test(xml) && !/<tv[\s>]/i.test(xml)) {
    throw new Error(
      "EPG fetch failed: response is not valid XMLTV (missing <programme> or <tv> tags)"
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
