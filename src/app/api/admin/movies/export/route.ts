import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";
import { parseVodAgentCmd } from "@/lib/vod-meta";

/** Export movies (MOVIE streams) as JSON — 1-stream import/export movies parity. */
export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = (req.nextUrl.searchParams.get("format") ?? "json").toLowerCase();
  const movies = await prisma.stream.findMany({
    where: { type: StreamType.MOVIE },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      streamUrl: true,
      backupUrl: true,
      streamIcon: true,
      categoryId: true,
      serverId: true,
      containerExtension: true,
      isActive: true,
      isAdult: true,
      sortOrder: true,
      channelId: true,
      agentStartCmd: true,
      category: { select: { name: true } },
      server: { select: { name: true } },
    },
  });

  const rows = movies.map((m) => {
    let tmdbId: string | null = null;
    if (m.agentStartCmd?.includes("tmdbId")) {
      try {
        const parsed = parseVodAgentCmd(m.agentStartCmd);
        tmdbId = parsed.tmdbId ? String(parsed.tmdbId) : null;
      } catch {
        /* ignore */
      }
    }
    return {
      id: m.id,
      name: m.name,
      source: m.streamUrl,
      backup: m.backupUrl,
      icon: m.streamIcon,
      category: m.category?.name ?? null,
      categoryId: m.categoryId,
      server: m.server?.name ?? null,
      serverId: m.serverId,
      container: m.containerExtension,
      isActive: m.isActive,
      isAdult: m.isAdult,
      sortOrder: m.sortOrder,
      channelId: m.channelId,
      tmdbId,
    };
  });

  if (format === "csv") {
    const header = [
      "name",
      "source",
      "backup",
      "icon",
      "category",
      "server",
      "container",
      "isActive",
      "isAdult",
      "tmdbId",
      "channelId",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const body = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.name,
          r.source,
          r.backup ?? "",
          r.icon ?? "",
          r.category ?? "",
          r.server ?? "",
          r.container ?? "",
          r.isActive,
          r.isAdult,
          r.tmdbId ?? "",
          r.channelId ?? "",
        ]
          .map(esc)
          .join(",")
      ),
    ].join("\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="movies-export.csv"',
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    count: rows.length,
    movies: rows,
  });
}
