import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const action = req.nextUrl.searchParams.get("action");

  if (action === "channels") {
    // Return unique EPG channel IDs from the EpgProgram table
    const programs = await prisma.epgProgram.findMany({
      select: { channelId: true, title: true },
      distinct: ["channelId"],
      orderBy: { channelId: "asc" },
      take: 5000,
    });
    const channels = programs.map((p) => ({
      id: p.channelId,
      displayName: p.title || p.channelId,
    }));
    return NextResponse.json({ channels });
  }

  const streams = await prisma.stream.findMany({
    where: { type: "LIVE" },
    select: {
      id: true,
      name: true,
      epgChannelId: true,
      channelId: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ streams });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.autoGenerateChannelIds === true) {
    const empty = await prisma.stream.findMany({
      where: { type: "LIVE", OR: [{ channelId: null }, { channelId: "" }] },
      select: { id: true },
    });
    await Promise.all(
      empty.map((s) =>
        prisma.stream.update({
          where: { id: s.id },
          data: { channelId: s.id },
        })
      )
    );
    return NextResponse.json({ updated: empty.length });
  }

  const { streamId, epgChannelId, channelId } = body;
  if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });

  const resolvedChannelId =
    channelId !== undefined
      ? String(channelId).trim() || streamId
      : undefined;

  const stream = await prisma.stream.update({
    where: { id: streamId },
    data: {
      ...(epgChannelId !== undefined ? { epgChannelId: epgChannelId || null } : {}),
      ...(resolvedChannelId !== undefined ? { channelId: resolvedChannelId } : {}),
    },
  });
  return NextResponse.json({ stream });
}
