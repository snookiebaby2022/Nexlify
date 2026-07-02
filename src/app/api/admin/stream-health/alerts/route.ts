import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = { isResolved: false };
  const streamId = searchParams.get("streamId");
  if (streamId) where.streamId = streamId;

  const [alerts, total] = await Promise.all([
    prisma.sourceMonitorAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
    }),
    prisma.sourceMonitorAlert.count({ where }),
  ]);

  return NextResponse.json({ alerts, total, limit, offset });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const alert = await prisma.sourceMonitorAlert.update({
    where: { id },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json({ alert });
}
