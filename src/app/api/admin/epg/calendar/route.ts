import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { normalizeTimeFormat } from "@/lib/epg-time";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

const MAX_PROGRAMS = 400;
const MAX_CHANNELS = 80;

export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const channelId = searchParams.get("channelId")?.trim() ?? "";

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  try {
    const general = await getSettingGroup("general");
    const display = {
      timezone: String(general.timezone || "Europe/London"),
      timeFormat: normalizeTimeFormat(general.timeFormat),
    };

    const where: {
      start: { gte: Date; lte: Date };
      channelId?: string;
    } = {
      start: { gte: startDate, lte: endDate },
    };
    if (channelId) where.channelId = channelId;

    const [programs, channelRows, totalInRange] = await Promise.all([
      prisma.epgProgram.findMany({
        where,
        orderBy: { start: "asc" },
        take: MAX_PROGRAMS,
      }),
      prisma.epgProgram.findMany({
        where: { start: { gte: startDate, lte: endDate } },
        select: { channelId: true },
        distinct: ["channelId"],
        take: MAX_CHANNELS,
        orderBy: { channelId: "asc" },
      }),
      prisma.epgProgram.count({ where }),
    ]);

    const mapped = programs.map((p) => ({
      id: p.id,
      title: p.title,
      start: p.start.toISOString(),
      end: p.stop.toISOString(),
      channelName: p.channelId,
      channelId: p.channelId,
      description: p.description,
    }));

    const channels = channelRows.map((r) => r.channelId).filter(Boolean).sort();

    return NextResponse.json({
      programs: mapped,
      channels,
      start,
      end,
      display,
      truncated: totalInRange > programs.length,
      totalInRange,
    });
  } catch (e) {
    console.error("EPG calendar query error:", e);
    return NextResponse.json({ error: "Failed to load EPG programs" }, { status: 500 });
  }
}
