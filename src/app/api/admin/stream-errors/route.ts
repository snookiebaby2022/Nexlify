import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";
import { streamProbeFixHint } from "@/lib/stream-probe-fix-hints";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await cacheGetOrSet("stream-errors:list", 30, async () => {
    const staleBefore = new Date(Date.now() - 120_000);

    const [probeFails, processErrors] = await Promise.all([
      prisma.stream.findMany({
        where: {
          isActive: true,
          OR: [{ lastProbeOk: false }, { lastProbeError: { not: null } }],
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
        take: 50,
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
        take: 50,
        orderBy: { lastSeenAt: "desc" },
      }),
    ]);

    return {
      probeFails: probeFails.map((s) => ({
        ...s,
        fixHint: streamProbeFixHint(s.lastProbeError),
      })),
      processErrors,
    };
  });

  return NextResponse.json(payload);
}
