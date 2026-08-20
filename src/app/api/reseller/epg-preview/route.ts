import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { normalizeTimeFormat } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER, PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [sources, programs] = await Promise.all([
    prisma.epgSource.findMany({
      where: { isActive: true },
      select: { id: true, name: true, country: true, lastSync: true },
      orderBy: { name: "asc" },
    }),
    prisma.epgProgram.findMany({
      where: { start: { lte: until }, stop: { gte: now } },
      orderBy: { start: "asc" },
      take: 200,
      select: {
        id: true,
        channelId: true,
        title: true,
        start: true,
        stop: true,
        source: { select: { name: true } },
      },
    }),
  ]);

  const general = await getSettingGroup("general");
  const display = {
    timezone: String(general.timezone || "Europe/London"),
    timeFormat: normalizeTimeFormat(general.timeFormat),
  };

  return NextResponse.json({ sources, programs, display });
}
