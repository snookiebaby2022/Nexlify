import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyAutoLogoToStream } from "@/lib/channel-logo";
import { enrichVodFromTmdb, isTmdbConfigured } from "@/lib/vod-tmdb-enrich";
import { PanelRole, StreamType } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
/**
 * Batch auto-icons:
 * - LIVE → channel logo resolver
 * - MOVIE / SERIES → TMDB poster when API key is configured
 *
 * Body (optional): { type?: "LIVE"|"MOVIE"|"SERIES"|"ALL", limit?: number }
 */
export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const typeRaw = String(body.type ?? "ALL").toUpperCase();
  const limit = Math.min(5000, Math.max(1, Number(body.limit ?? 500) || 500));

  const types: StreamType[] =
    typeRaw === "LIVE"
      ? [StreamType.LIVE]
      : typeRaw === "MOVIE"
        ? [StreamType.MOVIE]
        : typeRaw === "SERIES"
          ? [StreamType.SERIES]
          : [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES];

  const tmdbOk = await isTmdbConfigured();
  let updated = 0;
  let scanned = 0;
  const errors: string[] = [];

  for (const type of types) {
    const streams = await prisma.stream.findMany({
      where: {
        type,
        isActive: true,
        OR: [{ streamIcon: null }, { streamIcon: "" }],
      },
      select: { id: true, name: true, type: true, seriesName: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    scanned += streams.length;

    for (const s of streams) {
      try {
        if (s.type === StreamType.LIVE) {
          const logo = await applyAutoLogoToStream(s.id);
          if (logo) updated++;
          continue;
        }
        if (!tmdbOk) continue;
        const enrich = await enrichVodFromTmdb(
          s.seriesName?.trim() || s.name,
          s.type === StreamType.SERIES ? "SERIES" : "MOVIE"
        );
        if (enrich?.streamIcon) {
          await prisma.stream.update({
            where: { id: s.id },
            data: {
              streamIcon: enrich.streamIcon,
              ...(enrich.agentStartCmd ? { agentStartCmd: enrich.agentStartCmd } : {}),
            },
          });
          updated++;
        }
      } catch (e) {
        if (errors.length < 10) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    updated,
    tmdbConfigured: tmdbOk,
    types,
    errors: errors.length ? errors : undefined,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
