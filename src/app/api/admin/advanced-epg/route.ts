import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncEpgSource } from "@/lib/epg";
import { invalidateEpgCache } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sources = await prisma.epgSource.findMany({
    include: { _count: { select: { programs: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    sources: sources.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      format: s.sourceType,
      isActive: s.isActive,
      lastSync: s.lastSync?.getTime() ?? 0,
      quality: 0,
      channelCount: s._count.programs,
    })),
  });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, name, url, format, sourceId } = parsed.data;

  if (action === "create") {
    const source = await prisma.epgSource.create({
      data: {
        name,
        url,
        sourceType: format ?? "xmltv",
        isActive: true,
        syncEveryHours: 24,
      },
    });
    await invalidateEpgCache();
    return NextResponse.json({ id: source.id, name: source.name, url: source.url, format: source.sourceType });
  }

  if (action === "delete") {
    await prisma.epgSource.delete({ where: { id: sourceId } }).catch(() => {});
    await invalidateEpgCache();
    return NextResponse.json({ ok: true });
  }

  if (action === "sync") {
    try {
      const count = await syncEpgSource(sourceId);
      await invalidateEpgCache();
      return NextResponse.json({ ok: true, programsImported: count });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
