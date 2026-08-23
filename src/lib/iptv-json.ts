import { gzip } from "zlib";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { withIptvCors } from "@/lib/iptv-cors";

const gzipAsync = promisify(gzip);

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

/** Server-only — do not import from middleware (Edge cannot load zlib). */
export async function iptvJson(data: unknown, init?: IptvJsonInit): Promise<NextResponse> {
  const { compressFor, headers: initHeaders, ...rest } = init ?? {};
  const json = JSON.stringify(data);
  const headers = new Headers(initHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  if (json.length >= GZIP_MIN_BYTES && clientAcceptsGzip(compressFor ?? null)) {
    const compressed = await gzipAsync(Buffer.from(json, "utf8"), { level: 3 });
    headers.set("Content-Encoding", "gzip");
    const vary = headers.get("Vary");
    headers.set("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
    headers.set("Content-Length", String(compressed.length));
    return withIptvCors(new NextResponse(compressed, { ...rest, headers }));
  }

  return withIptvCors(new NextResponse(json, { ...rest, headers }));
}
