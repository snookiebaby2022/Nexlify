import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { parseJsonBody } from "@/lib/parse-json-body";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { mintAdminStreamProxyToken, verifyAdminStreamProxyToken } from "@/lib/admin-stream-proxy-token";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody<{ url?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const url = String(parsed.data.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    await assertPublicHttpUrl(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "URL is not allowed" },
      { status: 400 }
    );
  }

  const token = mintAdminStreamProxyToken(url, session.id);
  const playbackUrl = `/api/admin/streams/proxy?t=${encodeURIComponent(token)}`;
  return NextResponse.json({ token, playbackUrl });
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (req.nextUrl.searchParams.get("url")) {
    return NextResponse.json(
      { error: "Pass the stream URL via POST to mint a short-lived playback token" },
      { status: 405 }
    );
  }

  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const verified = verifyAdminStreamProxyToken(token, session.id);
  if (!verified.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });

  try {
    await assertPublicHttpUrl(verified.url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "URL is not allowed" },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const upstream = await fetch(verified.url, {
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return new NextResponse("Stream unavailable", { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy failed";
    return new NextResponse(msg, { status: 502 });
  }
}
