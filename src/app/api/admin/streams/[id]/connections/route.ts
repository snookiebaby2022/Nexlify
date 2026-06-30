import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { ownerScope } from "@/lib/owner-scope";

const STALE_MS = 5 * 60 * 1000;
const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

function inferOutput(userAgent: string | null): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("mpegts") || ua.includes(".ts")) return "MPEGTS";
  if (ua.includes("m3u8") || ua.includes("hls")) return "HLS";
  if (ua.includes("vlc")) return "TS";
  return "HLS";
}

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
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: streamId } = await ctx.params;
  const staleBefore = new Date(Date.now() - STALE_MS);
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
    clients: rows.map((c) => {
      const dur = durationSeconds(c.startedAt, c.lastSeenAt);
      return {
        id: c.id,
        line: c.line.username,
        server: stream.server?.name ?? "Main Server",
        ip: c.ip,
        duration: formatDuration(dur),
        durationSeconds: dur,
        output: inferOutput(c.userAgent),
        restreamer: c.line.isRestreamer,
        userAgent: c.userAgent,
        lastSeenAt: c.lastSeenAt.toISOString(),
      };
    }),
  });
}
