import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchProviderChannels } from "@/lib/provider-channel-search";
import { searchRemoteProviderChannels } from "@/lib/provider-remote-catalog";
import { PanelRole, StreamType } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typeParam = req.nextUrl.searchParams.get("type");
  const providerId = req.nextUrl.searchParams.get("providerId")?.trim() || undefined;
  const remote = req.nextUrl.searchParams.get("remote") === "1";
  const streamType =
    typeParam === "LIVE"
      ? StreamType.LIVE
      : typeParam === "MOVIE"
        ? StreamType.MOVIE
        : typeParam === "SERIES"
          ? StreamType.SERIES
          : undefined;

  const local = await searchProviderChannels(q, { streamType, providerId });
  let remoteMatches: typeof local = [];
  if (remote && providerId && streamType !== StreamType.SERIES) {
    remoteMatches = await searchRemoteProviderChannels(q, {
      providerId,
      streamType: streamType === StreamType.MOVIE ? "MOVIE" : "LIVE",
    });
  }

  const seen = new Set<string>();
  const matches = [];
  for (const m of [...local, ...remoteMatches]) {
    const key = `${m.source ?? "panel"}:${m.streamUrl || m.streamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(m);
  }

  return NextResponse.json({ matches });
}
