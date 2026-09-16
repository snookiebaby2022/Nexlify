import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import {
  PLAYBACK_ISSUE_ACTIONS,
  parseStreamErrorsPlaybackHours,
  playbackSinceFromHours,
} from "@/lib/stream-errors-playback";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hours = parseStreamErrorsPlaybackHours(req.nextUrl.searchParams.get("hours"));
  const since = playbackSinceFromHours(hours);

  const rows = await prisma.activityLog.findMany({
    where: {
      createdAt: { gte: since },
      action: { in: [...PLAYBACK_ISSUE_ACTIONS] },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { line: { select: { username: true } } },
  });

  const lines = [
    "createdAt,action,lineUsername,streamId,streamName,detail,status",
    ...rows.map((row) => {
      const meta =
        row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
      const streamName =
        (meta.streamName as string | undefined) ?? (meta.name as string | undefined) ?? "";
      const detail =
        (meta.error as string | undefined) ?? (meta.detail as string | undefined) ?? "";
      const status = meta.status != null ? String(meta.status) : "";
      return [
        row.createdAt.toISOString(),
        row.action,
        row.line?.username ?? (meta.lineUsername as string | undefined) ?? "",
        row.entityId ?? (meta.streamId as string | undefined) ?? "",
        streamName,
        detail,
        status,
      ]
        .map((c) => csvEscape(String(c)))
        .join(",");
    }),
  ];

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="playback-issues-${hours}h.csv"`,
    },
  });
}
