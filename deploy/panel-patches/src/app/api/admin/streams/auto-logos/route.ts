import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyAutoLogoToStream } from "@/lib/channel-logo";
import { PanelRole, StreamType } from "@prisma/client";

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const streams = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isActive: true, OR: [{ streamIcon: null }, { streamIcon: "" }] },
    select: { id: true },
    take: 500,
  });

  let updated = 0;
  for (const s of streams) {
    const logo = await applyAutoLogoToStream(s.id);
    if (logo) updated++;
  }

  return NextResponse.json({ scanned: streams.length, updated });
}
