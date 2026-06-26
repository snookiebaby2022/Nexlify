import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamsForLine } from "@/lib/lines";
import {
  buildEpgMapCsv,
  buildSubscriptionsExportCsv,
} from "@/lib/subscription-export";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = req.nextUrl.searchParams.get("format") ?? "subscriptions";
  const lineId = req.nextUrl.searchParams.get("lineId");
  const typeFilter = req.nextUrl.searchParams.get("type") ?? "LIVE";

  if (format === "epg_map") {
    let streams;
    if (lineId) {
      const line = await prisma.line.findUnique({
        where: { id: lineId },
        include: {
          bouquets: {
            include: {
              bouquet: {
                include: {
                  streams: {
                    include: { stream: { include: { category: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
      streams = streamsForLine(line).filter((s) =>
        typeFilter === "ALL" ? true : s.type === (typeFilter as StreamType)
      );
    } else {
      streams = await prisma.stream.findMany({
        where:
          typeFilter === "ALL"
            ? {}
            : { type: typeFilter as StreamType },
        include: { category: true },
        orderBy: { name: "asc" },
      });
    }

    const csv = buildEpgMapCsv(streams);
    const filename = lineId ? `epg-map-${lineId}.csv` : `epg-map-${typeFilter.toLowerCase()}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const where =
    session.role === PanelRole.ADMIN
      ? lineId
        ? { id: lineId }
        : {}
      : { ownerId: session.id, ...(lineId ? { id: lineId } : {}) };

  const lines = await prisma.line.findMany({
    where,
    include: { bouquets: { include: { bouquet: true } } },
    orderBy: { username: "asc" },
  });

  const csv = buildSubscriptionsExportCsv(lines);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions.csv"`,
    },
  });
}
