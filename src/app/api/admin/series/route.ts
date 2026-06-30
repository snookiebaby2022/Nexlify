import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.stream.findMany({
    where: { type: StreamType.SERIES, isActive: true },
    select: { id: true, name: true, seriesName: true },
    orderBy: [{ seriesName: "asc" }, { name: "asc" }],
  });

  const seen = new Set<string>();
  const series: { id: string; name: string }[] = [];
  for (const row of rows) {
    const key = (row.seriesName ?? row.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    series.push({ id: row.id, name: row.seriesName ?? row.name });
  }

  return NextResponse.json({ series });
}
