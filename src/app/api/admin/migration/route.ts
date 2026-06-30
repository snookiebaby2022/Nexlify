import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, MigrationSource, MigrationStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const source = searchParams.get("source");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (source) where.source = source as MigrationSource;
  if (status) where.status = status as MigrationStatus;

  const [jobs, total] = await Promise.all([
    prisma.migrationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { createdBy: { select: { id: true, username: true } } },
    }),
    prisma.migrationJob.count({ where }),
  ]);

  return NextResponse.json({ jobs, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const source = body.source as MigrationSource;
  if (!source) return NextResponse.json({ error: "source required" }, { status: 400 });

  const validSources: MigrationSource[] = [
    MigrationSource.XTREAM_UI,
    MigrationSource.XUI,
    MigrationSource.NXT,
    MigrationSource.WHMCS,
  ];
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const job = await prisma.migrationJob.create({
    data: {
      source,
      sourceUrl: body.sourceUrl ? String(body.sourceUrl) : null,
      sourceApiKey: body.sourceApiKey ? String(body.sourceApiKey) : null,
      status: MigrationStatus.QUEUED,
      options: body.options ?? null,
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

  const job = await prisma.migrationJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== MigrationStatus.RUNNING && job.status !== MigrationStatus.QUEUED) {
    return NextResponse.json({ error: "Migration is not running or queued" }, { status: 400 });
  }

  const updated = await prisma.migrationJob.update({
    where: { id },
    data: {
      status: MigrationStatus.FAILED,
      completedAt: new Date(),
      errors: job.errors ? job.errors : { cancelled: true },
    },
  });

  return NextResponse.json({ job: updated });
}
