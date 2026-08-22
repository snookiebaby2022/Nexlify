import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchProviderChannels } from "@/lib/provider-channel-search";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typeParam = req.nextUrl.searchParams.get("type");
  const streamType =
    typeParam === "LIVE"
      ? StreamType.LIVE
      : typeParam === "MOVIE"
        ? StreamType.MOVIE
        : typeParam === "SERIES"
          ? StreamType.SERIES
          : undefined;

  const matches = await searchProviderChannels(q, { streamType });
  return NextResponse.json({ matches });
}
