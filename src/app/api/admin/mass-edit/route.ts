import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, MassEditEntity, MassEditStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const entity = searchParams.get("entity");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity as MassEditEntity;
  if (status) where.status = status as MassEditStatus;

  const [jobs, total] = await Promise.all([
    prisma.massEditJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { createdBy: { select: { id: true, username: true } } },
    }),
    prisma.massEditJob.count({ where }),
  ]);

  return NextResponse.json({ jobs, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const entity = body.entity as MassEditEntity;
  const action = String(body.action ?? "").trim();
  if (!entity) return NextResponse.json({ error: "entity required" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const job = await prisma.massEditJob.create({
    data: {
      entity,
      action,
      filter: body.filter ?? null,
      changes: body.changes ?? {},
      affectedIds: [],
      totalCount: 0,
      successCount: 0,
      failCount: 0,
      status: MassEditStatus.QUEUED,
      createdById: session.id,
    },
  });

  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const job = await prisma.massEditJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== MassEditStatus.RUNNING && job.status !== MassEditStatus.QUEUED) {
    return NextResponse.json({ error: "Job is not running or queued" }, { status: 400 });
  }

  const updated = await prisma.massEditJob.update({
    where: { id },
    data: {
      status: MassEditStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ job: updated });
}
