import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200), 500);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { source: { contains: q, mode: "insensitive" } },
      { status: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ];
  }

  const jobs = await prisma.importJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { watchFolder: { select: { name: true } } },
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      source: j.source,
      streamType: j.streamType,
      status: j.status,
      imported: j.imported,
      skipped: j.skipped,
      message: j.message,
      watchFolderName: j.watchFolder?.name ?? null,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
    })),
  });
}
