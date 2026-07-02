import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const job = await prisma.migrationJob.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, username: true } } },
  });

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id,
      source: job.source,
      status: job.status,
      sourceUrl: job.sourceUrl,
      options: job.options,
      stats: job.stats,
      errors: job.errors,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
  });
}
