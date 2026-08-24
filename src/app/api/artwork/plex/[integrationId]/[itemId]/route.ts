import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPlexBaseUrl,
  extractPlexToken,
  normalizePlexConfig,
  plexClientIdentifier,
  plexRequestHeaders,
} from "@/lib/plex-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeItemId(raw: string): string | null {
  const id = decodeURIComponent(raw || "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[\w.-]+$/.test(id)) return null;
  return id;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ integrationId: string; itemId: string }> }
) {
  const { integrationId, itemId: itemIdRaw } = await ctx.params;
  const itemId = safeItemId(itemIdRaw);
  if (!integrationId || !itemId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const row = await prisma.mediaIntegration.findFirst({
    where: { id: integrationId, type: "plex" },
    select: { config: true },
  });
  if (!row) return new NextResponse("Not found", { status: 404 });

  const cfg = normalizePlexConfig((row.config ?? {}) as Record<string, unknown>);
  const base = buildPlexBaseUrl(cfg);
  const token = extractPlexToken(String(cfg.token ?? ""));
  if (!base || !token) return new NextResponse("Not found", { status: 404 });

  const url = `${base}/library/metadata/${itemId}/thumb?X-Plex-Token=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: plexRequestHeaders(token, plexClientIdentifier(cfg)),
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
  } catch {
    return new NextResponse("Unavailable", { status: 502 });
  }
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
