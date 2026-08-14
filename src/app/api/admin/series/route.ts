import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rows = await prisma.stream.findMany({
      where: { type: StreamType.SERIES },
      select: {
        id: true,
        name: true,
        seriesName: true,
        episodeNum: true,
        seasonNum: true,
        streamIcon: true,
        isActive: true,
        category: { select: { name: true } },
      },
      orderBy: [{ seriesName: "asc" }, { name: "asc" }],
    });

    type SeriesRow = {
      id: string;
      name: string;
      episodeCount: number;
      streamIcon: string | null;
      isActive: boolean;
      categoryName: string | null;
    };

    const groups = new Map<string, SeriesRow>();
    for (const row of rows) {
      const name = (row.seriesName ?? row.name).trim() || row.name;
      const key = name.toLowerCase();
      const isEpisode = row.episodeNum != null && row.episodeNum > 0;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          id: row.id,
          name,
          episodeCount: isEpisode ? 1 : 0,
          streamIcon: row.streamIcon,
          isActive: row.isActive,
          categoryName: row.category?.name ?? null,
        });
        continue;
      }
      if (isEpisode) {
        existing.episodeCount += 1;
      } else {
        existing.id = row.id;
        existing.streamIcon = row.streamIcon ?? existing.streamIcon;
        existing.isActive = row.isActive;
        existing.categoryName = row.category?.name ?? existing.categoryName;
      }
    }

    const series = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ series });
  } catch (e) {
    return NextResponse.json({
      series: [],
      error: e instanceof Error ? e.message : "Failed to load series",
    });
  }
}
