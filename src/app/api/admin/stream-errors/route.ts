import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staleBefore = new Date(Date.now() - 120_000);

  const [probeFails, processErrors] = await Promise.all([
    prisma.stream.findMany({
      where: {
        OR: [
          { lastProbeOk: false },
          { lastProbeError: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        lastProbeAt: true,
        lastProbeError: true,
        serverId: true,
        server: { select: { name: true } },
      },
      take: 100,
      orderBy: { lastProbeAt: "desc" },
    }),
    prisma.streamProcess.findMany({
      where: {
        OR: [
          { status: "error" },
          { errorMessage: { not: null } },
          { status: "restarting" },
          { lastSeenAt: { lt: staleBefore }, status: { in: ["running", "unknown"] } },
        ],
      },
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
      take: 100,
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  return NextResponse.json({ probeFails, processErrors });
}
