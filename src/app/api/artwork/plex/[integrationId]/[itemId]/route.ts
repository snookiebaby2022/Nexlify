import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPlexBaseUrl,
  extractPlexToken,
  normalizePlexConfig,
} from "@/lib/plex-config";
import { fetchPlexPosterResponse } from "@/lib/plex-poster-fetch";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { searchTmdb } from "@/lib/tmdb";
import { tmdbFetch } from "@/lib/tmdb-http";
import { cleanTitleForTmdb } from "@/lib/vod-title-clean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeItemId(raw: string): string | null {
  const id = decodeURIComponent(raw || "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[\w.-]+$/.test(id)) return null;
  return id;
}

async function tmdbPosterForStream(name: string, type: string): Promise<Response | null> {
  const mediaType = type === "SERIES" ? "tv" : "movie";
  const query = cleanTitleForTmdb(name);
  if (!query) return null;
  try {
    const hits = await searchTmdb(query, mediaType);
    const posterUrl = hits[0]?.posterUrl;
    if (!posterUrl) return null;
    const res = await tmdbFetch(posterUrl.replace("/w185", "/w500"));
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

function imageResponse(body: ArrayBuffer, contentType: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
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

  let res = await fetchPlexPosterResponse(cfg, itemId);

  if (!res) {
    const streamUrl = buildIntegrationStreamUrl("plex", integrationId, itemId);
    const stream = await prisma.stream.findFirst({
      where: { streamUrl },
      select: { name: true, type: true, seriesName: true },
    });
    const lookupName = stream?.seriesName || stream?.name || "";
    if (lookupName) {
      res = await tmdbPosterForStream(lookupName, stream?.type ?? "MOVIE");
    }
  }

  if (!res) return new NextResponse("Not found", { status: 404 });

  const rawType = (res.headers.get("content-type") || "").toLowerCase();
  const contentType = rawType.startsWith("image/")
    ? rawType
    : rawType.startsWith("application/octet-stream") || !rawType
      ? "image/jpeg"
      : "";
  if (!contentType) return new NextResponse("Not found", { status: 404 });

  const body = await res.arrayBuffer();
  return imageResponse(body, contentType);
}
