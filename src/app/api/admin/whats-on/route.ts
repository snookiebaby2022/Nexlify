import { NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";
import { displayCatalogStreamName } from "@/lib/stream-catalog-name";

type Item = {
  id: string;
  catalogName: string;
  nowPlaying: string;
  category: string;
  country: string;
};

let cache: { at: number; items: Item[] } | null = null;
const CACHE_MS = 45_000;

async function loadWhatsOn(): Promise<Item[]> {
  const now = new Date();
  const streams = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, epgChannelId: { not: null } },
    select: {
      id: true,
      name: true,
      streamIcon: true,
      epgChannelId: true,
      agentStartCmd: true,
      category: { select: { name: true } },
    },
    take: 400,
    orderBy: { sortOrder: "asc" },
  });

  const epgIds = [...new Set(streams.map((s) => s.epgChannelId).filter((id): id is string => Boolean(id)))];
  const programs =
    epgIds.length === 0
      ? []
      : await prisma.epgProgram.findMany({
          where: {
            channelId: { in: epgIds },
            start: { lte: now },
            stop: { gt: now },
          },
          select: { channelId: true, title: true },
        });
  const titleByChannel = new Map<string, string>();
  for (const p of programs) {
    if (p.title.trim() && !titleByChannel.has(p.channelId)) {
      titleByChannel.set(p.channelId, p.title.trim());
    }
  }

  return streams
    .map((s) => {
      const meta = parseLiveStreamMeta(s.agentStartCmd);
      const catalog = displayCatalogStreamName(meta.catalogName || s.name, s.name, s.streamIcon);
      const nowPlaying =
        titleByChannel.get(s.epgChannelId ?? "") || meta.nowPlayingTitle?.trim() || "";
      const cat = s.category?.name ?? "";
      const country = cat.split("|")[0]?.trim() || cat.split(" ")[0] || "";
      return { id: s.id, catalogName: catalog, nowPlaying, category: cat, country };
    })
    .filter((r) => r.nowPlaying)
    .slice(0, 80);
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ items: cache.items, at: new Date(cache.at).toISOString() });
  }

  const items = await loadWhatsOn();
  cache = { at: Date.now(), items };
  return NextResponse.json({ items, at: new Date().toISOString() });
}
