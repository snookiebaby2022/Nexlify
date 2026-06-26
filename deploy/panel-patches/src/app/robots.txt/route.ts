import { NextResponse } from "next/server";

/** Disallow all crawlers from indexing the panel. */
export async function GET() {
  const body = ["User-agent: *", "Disallow: /", ""].join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
