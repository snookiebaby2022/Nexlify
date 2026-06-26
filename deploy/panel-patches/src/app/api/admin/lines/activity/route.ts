import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lineId = req.nextUrl.searchParams.get("lineId");
  const where =
    session.role === PanelRole.ADMIN
      ? lineId
        ? { lineId }
        : {}
      : { line: { ownerId: session.id }, ...(lineId ? { lineId } : {}) };

  const format = req.nextUrl.searchParams.get("format");

  const connections = await prisma.liveConnection.findMany({
    where,
    include: {
      line: { select: { username: true } },
      stream: { select: { name: true, type: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 500,
  });

  if (format === "csv") {
    const header = "line,stream,type,ip,user_agent,started,last_seen\n";
    const rows = connections
      .map((c) =>
        [
          c.line.username,
          c.stream?.name ?? "",
          c.stream?.type ?? "",
          c.ip ?? "",
          (c.userAgent ?? "").replace(/"/g, '""'),
          c.startedAt.toISOString(),
          c.lastSeenAt.toISOString(),
        ]
          .map((v) => `"${v}"`)
          .join(",")
      )
      .join("\n");
    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="line-activity.csv"',
      },
    });
  }

  return NextResponse.json({ connections });
}
