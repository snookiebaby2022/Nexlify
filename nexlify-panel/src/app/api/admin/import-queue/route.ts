import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const job = await prisma.importJob.create({
    data: {
      kind: body.kind ?? "FOLDER",
      source: String(body.source ?? ""),
      streamType: body.streamType ?? "MOVIE",
      status: "queued",
      watchFolderId: body.watchFolderId ?? null,
      categoryId: body.categoryId ?? null,
      serverId: body.serverId ?? null,
    },
  });
  return NextResponse.json({ job });
}
