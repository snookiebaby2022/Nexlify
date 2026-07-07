import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncEpgSource } from "@/lib/epg";
import { invalidateEpgCache } from "@/lib/cache-invalidate";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "sources") {
      const sources = await prisma.epgSource.findMany({
        include: { _count: { select: { programs: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(sources.map(s => ({
        id: s.id,
        name: s.name,
        url: s.url,
        type: s.sourceType,
        isActive: s.isActive,
        priority: 0,
        lastSyncAt: s.lastSync?.toISOString() ?? null,
        lastError: s.lastSyncError ?? null,
        channelCount: s._count.programs,
      })));
    }
    return NextResponse.json([]);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  try {
    if (action === "add") {
      const src = body.source;
      const source = await prisma.epgSource.create({
        data: {
          name: src.name,
          url: src.url,
          sourceType: src.type ?? "xmltv",
          isActive: true,
          syncEveryHours: 24,
        },
      });
      await invalidateEpgCache();
      // Auto-sync new source in background
      void syncEpgSource(source.id).catch(() => {});
      return NextResponse.json({ id: source.id, name: source.name, url: source.url, type: source.sourceType, isActive: true, priority: 0, lastSyncAt: null, lastError: null, channelCount: 0 });
    }
    if (action === "update") {
      await prisma.epgSource.update({ where: { id: body.id }, data: body.updates });
      await invalidateEpgCache();
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      await prisma.epgSource.delete({ where: { id: body.id } }).catch(() => {});
      await invalidateEpgCache();
      return NextResponse.json({ ok: true });
    }
    if (action === "sync") {
      const count = await syncEpgSource(body.id);
      await invalidateEpgCache();
      return NextResponse.json({ success: true, channelCount: count });
    }
    if (action === "sync-all") {
      const sources = await prisma.epgSource.findMany({ where: { isActive: true } });
      let synced = 0;
      let failed = 0;
      for (const s of sources) {
        try { await syncEpgSource(s.id); synced++; }
        catch { failed++; }
      }
      await invalidateEpgCache();
      return NextResponse.json({ synced, failed });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
