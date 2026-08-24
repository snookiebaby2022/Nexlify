import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncEpgSource } from "@/lib/epg";
import { invalidateEpgCache } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lite = req.nextUrl.searchParams.get("lite") === "1";
  const sources = await prisma.epgSource.findMany({
    include: lite ? undefined : { _count: { select: { programs: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.syncAll === true) {
    const sources = await prisma.epgSource.findMany({ where: { isActive: true } });
    let synced = 0;
    let programsImported = 0;
    const errors: string[] = [];
    for (const source of sources) {
      try {
        const count = await syncEpgSource(source.id, { skipAutoMatch: true });
        synced++;
        programsImported += count;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "sync failed";
        errors.push(`${source.name}: ${msg}`);
        await prisma.epgSource.update({
          where: { id: source.id },
          data: { lastSyncError: msg.slice(0, 500) },
        }).catch(() => {});
      }
    }
    try {
      const { autoAssignMissingEpg } = await import("@/lib/epg-auto-match");
      await autoAssignMissingEpg({ limit: 800 });
    } catch {
      /* optional */
    }
    await invalidateEpgCache();
    return NextResponse.json({
      ok: true,
      synced,
      programsImported,
      total: sources.length,
      errors: errors.slice(0, 30),
    });
  }

  if (body.sync && body.sourceId) {
    try {
      const count = await syncEpgSource(body.sourceId);
      return NextResponse.json({ ok: true, synced: count, programsImported: count });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      await prisma.epgSource.update({
        where: { id: String(body.sourceId) },
        data: { lastSyncError: msg.slice(0, 500) },
      }).catch(() => {});
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const source = await prisma.epgSource.create({
    data: {
      name: body.name,
      url: body.url,
      sourceType: String(body.sourceType ?? "xmltv"),
      config: body.config ?? undefined,
      country: body.country || null,
      syncEveryHours: body.syncEveryHours != null ? Number(body.syncEveryHours) : 24,
    },
  });
  await invalidateEpgCache();

  // Auto-sync the new source in background
  void syncEpgSource(source.id).catch(() => {});

  return NextResponse.json({ source });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.epgSource.delete({ where: { id } });
  await invalidateEpgCache();
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
