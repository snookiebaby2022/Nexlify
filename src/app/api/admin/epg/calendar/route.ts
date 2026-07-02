import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  try {
    const programs = await prisma.epgProgram.findMany({
      where: {
        start: { gte: startDate },
        stop: { lte: endDate },
      },
      orderBy: { start: "asc" },
      take: 5000,
    });

    const mapped = programs.map((p) => ({
      id: p.id,
      title: p.title,
      start: p.start.toISOString(),
      end: p.stop.toISOString(),
      channelName: p.channelId,
      channelId: p.channelId,
      description: p.description,
    }));

    const channels = [...new Set(mapped.map((p) => p.channelName))].sort();

    return NextResponse.json({ programs: mapped, channels, start, end });
  } catch (e) {
    console.error("EPG calendar query error:", e);
    return NextResponse.json({ error: "Failed to load EPG programs" }, { status: 500 });
  }
}
