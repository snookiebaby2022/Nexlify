import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const streamId = searchParams.get("streamId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (streamId) where.streamId = streamId;

  const [jobs, total] = await Promise.all([
    prisma.tmdbSyncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { stream: { select: { id: true, name: true } } },
    }),
    prisma.tmdbSyncJob.count({ where }),
  ]);

  return NextResponse.json({ jobs, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const type = String(body.type ?? "").trim();
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const job = await prisma.tmdbSyncJob.create({
    data: {
      type,
      tmdbId: body.tmdbId != null ? Number(body.tmdbId) : null,
      imdbId: body.imdbId ? String(body.imdbId) : null,
      title: body.title ? String(body.title) : null,
      streamId: body.streamId ? String(body.streamId) : null,
      status: "queued",
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

  const data: Record<string, unknown> = {};
  if (body.status) data.status = String(body.status);
  if (body.metadata !== undefined) data.metadata = body.metadata;
  if (body.posterUrl !== undefined) data.posterUrl = body.posterUrl ? String(body.posterUrl) : null;
  if (body.backdropUrl !== undefined) data.backdropUrl = body.backdropUrl ? String(body.backdropUrl) : null;
  if (body.genres !== undefined) data.genres = Array.isArray(body.genres) ? body.genres.map(String) : [];
  if (body.overview !== undefined) data.overview = body.overview ? String(body.overview) : null;
  if (body.rating !== undefined) data.rating = body.rating != null ? Number(body.rating) : null;
  if (body.releaseDate !== undefined) data.releaseDate = body.releaseDate ? new Date(body.releaseDate) : null;
  if (body.runtime !== undefined) data.runtime = body.runtime != null ? Number(body.runtime) : null;
  if (body.seasons !== undefined) data.seasons = body.seasons ?? null;
  if (body.episodes !== undefined) data.episodes = body.episodes ?? null;
  if (body.error !== undefined) data.error = body.error ? String(body.error) : null;
  if (body.status === "completed" || body.status === "failed") data.completedAt = new Date();

  const job = await prisma.tmdbSyncJob.update({ where: { id }, data });
  return NextResponse.json({ job });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const job = await prisma.tmdbSyncJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "running") {
    return NextResponse.json({ error: "Cannot cancel a running job" }, { status: 400 });
  }

  await prisma.tmdbSyncJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
