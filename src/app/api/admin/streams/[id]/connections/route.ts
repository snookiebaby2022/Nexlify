import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeConnectionQualityWithLive, getLiveQualitySample } from "@/lib/connection-quality-live";
import {
  getConnectionPlaybackOutput,
  resolvePlaybackOutputLabel,
} from "@/lib/connection-playback-output";
import { PanelRole } from "@prisma/client";
import { ownerScope } from "@/lib/owner-scope";

import { LIVE_STALE_MS } from "@/lib/connections";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

function durationSeconds(startedAt: Date, lastSeenAt: Date): number {
  return Math.max(0, Math.floor((lastSeenAt.getTime() - startedAt.getTime()) / 1000));
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: streamId } = await ctx.params;
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
  const scope = ownerScope(session);

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: {
      id: true,
      name: true,
      server: { select: { id: true, name: true } },
    },
  });
  if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });

  const rows = await prisma.liveConnection.findMany({
    where: {
      streamId,
      lastSeenAt: { gte: staleBefore },
      ...(scope ? { line: { ownerId: scope } } : {}),
    },
    include: {
      line: { select: { username: true, isRestreamer: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({
    stream,
    clients: await Promise.all(
      rows.map(async (c) => {
        const dur = durationSeconds(c.startedAt, c.lastSeenAt);
        const live = await getLiveQualitySample(c.lineId, streamId, c.ip);
        const quality = computeConnectionQualityWithLive({
          startedAt: c.startedAt,
          lastSeenAt: c.lastSeenAt,
          live,
        });
        const cachedOutput = await getConnectionPlaybackOutput(c.lineId, streamId, c.ip);
        const output = resolvePlaybackOutputLabel({
          cached: cachedOutput,
          userAgent: c.userAgent,
        });
        return {
          id: c.id,
          line: c.line.username,
          server: stream.server?.name ?? "Main Server",
          ip: c.ip,
          duration: formatDuration(dur),
          durationSeconds: dur,
          output,
          restreamer: c.line.isRestreamer,
          userAgent: c.userAgent,
          lastSeenAt: c.lastSeenAt.toISOString(),
          quality,
        };
      })
    ),
  });
}
