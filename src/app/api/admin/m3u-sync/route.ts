import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { isRemoteM3uUrl } from "@/lib/m3u-watch-sync";
import { runM3uUrlSync } from "@/lib/m3u-sync-jobs";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

const VALID_TYPES = new Set(["LIVE", "MOVIE", "SERIES", "MIXED"]);

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const providerId = searchParams.get("providerId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (providerId) where.providerId = providerId;

  const [jobs, total, providers] = await Promise.all([
    prisma.m3uSyncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { provider: { select: { id: true, name: true } } },
    }),
    prisma.m3uSyncJob.count({ where }),
    prisma.streamProvider.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({ jobs, total, limit, offset, providers });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.action === "sync" && body.id) {
    const job = await prisma.m3uSyncJob.findUnique({ where: { id: String(body.id) } });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isRemoteM3uUrl(job.url)) {
      return NextResponse.json({ error: "Invalid M3U URL" }, { status: 400 });
    }

    try {
      const result = await runM3uUrlSync(job.url, {
        contentType: job.streamType,
        categoryId: job.categoryId,
        serverId: job.serverId,
        autoTmdb: job.autoTmdb,
        autoCategory: job.autoCategory,
      });
      const now = new Date();
      const intervalMs = Math.max(5, job.syncIntervalMins) * 60_000;
      await prisma.m3uSyncJob.update({
        where: { id: job.id },
        data: {
          lastSyncAt: now,
          nextSyncAt: new Date(Date.now() + intervalMs),
          lastResult: {
            at: now.toISOString(),
            imported: result.imported,
            skipped: result.skipped,
            updated: result.updated ?? 0,
            errors: result.errors ?? [],
          },
        },
      });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Sync failed" },
        { status: 400 }
      );
    }
  }

  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  if (!isRemoteM3uUrl(url)) {
    return NextResponse.json({ error: "url must be http(s) M3U playlist" }, { status: 400 });
  }

  const streamType = VALID_TYPES.has(String(body.streamType ?? ""))
    ? String(body.streamType)
    : "MIXED";
  const syncIntervalMins = Math.max(5, Number(body.syncIntervalMins ?? 60));

  const job = await prisma.m3uSyncJob.create({
    data: {
      name,
      url,
      providerId: body.providerId ? String(body.providerId) : null,
      streamType,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      serverId: body.serverId ? String(body.serverId) : null,
      autoTmdb: body.autoTmdb !== false,
      autoCategory: body.autoCategory !== false,
      autoAssignEpg: body.autoAssignEpg !== false,
      categoryMap: body.categoryMap ?? null,
      syncIntervalMins,
      status: "active",
      nextSyncAt: new Date(Date.now() + syncIntervalMins * 60_000),
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
  if (body.name !== undefined) data.name = body.name ? String(body.name) : undefined;
  if (body.url !== undefined) data.url = body.url ? String(body.url) : undefined;
  if (body.providerId !== undefined) data.providerId = body.providerId ? String(body.providerId) : null;
  if (body.streamType !== undefined && VALID_TYPES.has(String(body.streamType))) {
    data.streamType = String(body.streamType);
  }
  if (body.categoryId !== undefined) data.categoryId = body.categoryId ? String(body.categoryId) : null;
  if (body.serverId !== undefined) data.serverId = body.serverId ? String(body.serverId) : null;
  if (body.autoTmdb !== undefined) data.autoTmdb = Boolean(body.autoTmdb);
  if (body.autoCategory !== undefined) data.autoCategory = Boolean(body.autoCategory);
  if (body.autoAssignEpg !== undefined) data.autoAssignEpg = Boolean(body.autoAssignEpg);
  if (body.categoryMap !== undefined) data.categoryMap = body.categoryMap ?? null;
  if (body.syncIntervalMins !== undefined) data.syncIntervalMins = Math.max(5, Number(body.syncIntervalMins));
  if (body.status !== undefined) data.status = String(body.status);
  if (body.triggerSync === true) {
    data.nextSyncAt = new Date();
  }

  const job = await prisma.m3uSyncJob.update({ where: { id }, data });
  return NextResponse.json({ job });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.m3uSyncJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
