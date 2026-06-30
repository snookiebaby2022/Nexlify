import { NextRequest, NextResponse } from "next/server";
import { assertAllowedFetchUrl } from "@/lib/webplayer-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  const userAgent = req.nextUrl.searchParams.get("userAgent");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = assertAllowedFetchUrl(rawUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "*/*",
      "User-Agent": userAgent?.trim() || "Nexlify-WebPlayer/1.0",
    };
    const res = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch playlist URL." }, { status: 502 });
  }
}
