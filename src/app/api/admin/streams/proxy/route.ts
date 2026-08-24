import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { parseJsonBody } from "@/lib/parse-json-body";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { mintAdminStreamProxyToken, verifyAdminStreamProxyToken } from "@/lib/admin-stream-proxy-token";
import {
  adminPreviewWantsHls,
  adminProxyPlaybackPath,
  decodePreviewRelayTarget,
  fetchAdminUpstream,
  looksLikeHlsManifest,
  rewriteAdminHlsManifest,
  sanitizeAdminManifestBody,
} from "@/lib/admin-stream-preview";
import { isHlsPlaybackUrl, isSafeUpstreamUrl } from "@/lib/hls-playback";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody<{ url?: unknown; hls?: unknown }>(req);
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

  const wantsHls =
    parsed.data.hls === true ||
    adminPreviewWantsHls(url, false) ||
    (!url.includes(".ts") && /^https?:\/\//i.test(url));
  const token = mintAdminStreamProxyToken(url, session.id);
  const playbackUrl = adminProxyPlaybackPath(token, {
    hls: wantsHls && !isHlsPlaybackUrl(url) ? true : undefined,
  });
  return NextResponse.json({ token, playbackUrl, hls: wantsHls });
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

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

  const forceHls = req.nextUrl.searchParams.get("hls") === "1";
  const relayEnc = req.nextUrl.searchParams.get("r");
  const targetUrl = decodePreviewRelayTarget(relayEnc, verified.url);

  try {
    await assertPublicHttpUrl(targetUrl);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "URL is not allowed" },
      { status: 400 }
    );
  }
  if (!isSafeUpstreamUrl(targetUrl)) {
    return NextResponse.json({ error: "URL is not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetchAdminUpstream(targetUrl);
    const text = upstream.body.toString("utf8");
    const isManifest = looksLikeHlsManifest(text, upstream.contentType, forceHls);

    if (isManifest) {
      const relay = (absoluteUrl: string) => {
        if (!isSafeUpstreamUrl(absoluteUrl)) return absoluteUrl;
        const childToken = mintAdminStreamProxyToken(verified.url, session.id);
        return adminProxyPlaybackPath(childToken, {
          hls: true,
          relayTarget: absoluteUrl,
        });
      };
      const body = sanitizeAdminManifestBody(
        rewriteAdminHlsManifest(text, upstream.finalUrl, relay)
      );
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/x-mpegURL",
          "Cache-Control": "no-cache, no-store",
          Connection: "keep-alive",
        },
      });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.contentType,
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy failed";
    return new NextResponse(msg, { status: 502 });
  }
}
