import { gzip } from "zlib";
import { promisify } from "util";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
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
  // Only gzip when the client advertised it. Forcing gzip on XCIPTV/Smarters
  // User-Agents (no Accept-Encoding) makes get_series_info / category lists
  // unreadable and the app UI goes blank.
  return /\bgzip\b/i.test(ae);
}

/** Stream a pre-gzipped catalog/xmltv file without loading it into RAM. */
export function iptvGzipFileResponse(
  filePath: string,
  compressFor: Request | null,
  contentType: string,
  opts?: { asGzipFile?: boolean }
): NextResponse {
  const headers = new Headers();
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  let nodeStream: Readable;
  if (opts?.asGzipFile) {
    headers.set("Content-Type", "application/gzip");
    nodeStream = createReadStream(filePath);
    try {
      headers.set("Content-Length", String(statSync(filePath).size));
    } catch {
      /* size unknown */
    }
  } else if (clientAcceptsGzip(compressFor)) {
    headers.set("Content-Type", contentType);
    headers.set("Content-Encoding", "gzip");
    headers.set("Vary", "Accept-Encoding");
    nodeStream = createReadStream(filePath);
    try {
      headers.set("Content-Length", String(statSync(filePath).size));
    } catch {
      /* size unknown */
    }
  } else {
    headers.set("Content-Type", contentType);
    headers.set("Vary", "Accept-Encoding");
    nodeStream = createReadStream(filePath).pipe(createGunzip());
  }
  return withIptvCors(
    new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, { headers })
  );
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
