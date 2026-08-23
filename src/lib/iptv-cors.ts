import { gzipSync } from "zlib";
import { NextResponse } from "next/server";

/** Allow browser clients (nexlify.live/webplayer, customer sites) to call IPTV APIs. */
export const IPTV_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept, Range",
  "Access-Control-Max-Age": "86400",
};

export function withIptvCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(IPTV_CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export function iptvCorsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: IPTV_CORS_HEADERS });
}

export type IptvJsonInit = ResponseInit & {
  /** When set, gzip large JSON bodies if the client accepts gzip (Xtream playlist speed). */
  compressFor?: Request | null;
};

const GZIP_MIN_BYTES = 2048;

function clientAcceptsGzip(req?: Request | null): boolean {
  if (!req) return false;
  const ae = req.headers.get("accept-encoding") ?? "";
  return /\bgzip\b/i.test(ae);
}

export function iptvJson(data: unknown, init?: IptvJsonInit): NextResponse {
  const { compressFor, headers: initHeaders, ...rest } = init ?? {};
  const json = JSON.stringify(data);
  const headers = new Headers(initHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  if (json.length >= GZIP_MIN_BYTES && clientAcceptsGzip(compressFor ?? null)) {
    const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 4 });
    headers.set("Content-Encoding", "gzip");
    const vary = headers.get("Vary");
    headers.set("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
    // Content-Length helps some IPTV apps finish the download promptly
    headers.set("Content-Length", String(compressed.length));
    return withIptvCors(new NextResponse(compressed, { ...rest, headers }));
  }

  return withIptvCors(new NextResponse(json, { ...rest, headers }));
}

export function iptvText(body: BodyInit | null, init?: ResponseInit): NextResponse {
  return withIptvCors(new NextResponse(body, init));
}
