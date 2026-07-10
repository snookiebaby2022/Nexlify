import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, MigrationSource } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobs = await prisma.migrationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const source = (body.source as MigrationSource) ?? MigrationSource.XTREAM_UI;
  const job = await prisma.migrationJob.create({
    data: {
      source,
      sourceUrl: body.sourceUrl ?? "",
      status: "QUEUED",
      createdById: session.id,
    },
  });
  return NextResponse.json({ job });
}
