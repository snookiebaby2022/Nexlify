import { NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";
import { displayCatalogStreamName } from "@/lib/stream-catalog-name";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, epgChannelId: { not: null } },
    select: {
      id: true,
      name: true,
      agentStartCmd: true,
      category: { select: { name: true } },
    },
    take: 200,
    orderBy: { sortOrder: "asc" },
  });

  const items = rows
    .map((s) => {
      const meta = parseLiveStreamMeta(s.agentStartCmd);
      const catalog = displayCatalogStreamName(meta.catalogName || s.name);
      const now = meta.nowPlayingTitle?.trim() || "";
      const cat = s.category?.name ?? "";
      const country = cat.split("|")[0]?.trim() || cat.split(" ")[0] || "";
      return {
        id: s.id,
        catalogName: catalog,
        nowPlaying: now,
        category: cat,
        country,
      };
    })
    .filter((r) => r.nowPlaying)
    .slice(0, 80);

  return NextResponse.json({ items, at: new Date().toISOString() });
}
