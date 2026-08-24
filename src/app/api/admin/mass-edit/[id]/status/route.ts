import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const job = await prisma.massEditJob.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, username: true } } },
  });

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id,
      entity: job.entity,
      action: job.action,
      status: job.status,
      totalCount: job.totalCount,
      successCount: job.successCount,
      failCount: job.failCount,
      affectedIds: job.affectedIds,
      errors: job.errors,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
  });
}
