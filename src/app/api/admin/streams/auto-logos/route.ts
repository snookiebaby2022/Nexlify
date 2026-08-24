import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fillMissingStreamArtwork } from "@/lib/artwork-fill";
import { PanelRole, StreamType } from "@prisma/client";
import { apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

/**
 * Batch auto-icons:
 * - IPTV provider catalog stream_icon / cover (all missing that match)
 * - MOVIE / SERIES leftovers → TMDB
 * - LIVE leftovers → channel logo resolver
 *
 * Body (optional): { type?: "LIVE"|"MOVIE"|"SERIES"|"ALL", tmdbLimit?: number }
 */
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const typeRaw = String(body.type ?? "ALL").toUpperCase();
    const tmdbLimit = Math.min(2000, Math.max(0, Number(body.tmdbLimit ?? body.limit ?? 300) || 300));

    const types: StreamType[] =
      typeRaw === "LIVE"
        ? [StreamType.LIVE]
        : typeRaw === "MOVIE"
          ? [StreamType.MOVIE]
          : typeRaw === "SERIES"
            ? [StreamType.SERIES]
            : [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES];

    const result = await fillMissingStreamArtwork({
      types,
      tmdbLimit,
      liveLogoLimit: typeRaw === "MOVIE" || typeRaw === "SERIES" ? 0 : 40,
    });

    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      updated: result.updated,
      fromProvider: result.fromProvider,
      fromSeriesCover: result.fromSeriesCover,
      fromTmdb: result.fromTmdb,
      fromLiveLogo: result.fromLiveLogo,
      remaining: result.remaining,
      tmdbConfigured: result.tmdbConfigured,
      types,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
