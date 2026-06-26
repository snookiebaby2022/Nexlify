import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [processes, activity] = await Promise.all([
    prisma.streamProcess.findMany({
      where: { lastSeenAt: { gte: staleBefore } },
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        OR: [
          { entity: "stream" },
          { action: { contains: "stream" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({ processes, activity });
}
