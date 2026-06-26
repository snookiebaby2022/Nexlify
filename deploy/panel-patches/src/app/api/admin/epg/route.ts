import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncEpgSource } from "@/lib/epg";
import { cacheDel } from "@/lib/cache";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sources = await prisma.epgSource.findMany({
    include: { _count: { select: { programs: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.syncAll === true) {
    const sources = await prisma.epgSource.findMany({ where: { isActive: true } });
    let synced = 0;
    const errors: string[] = [];
    for (const source of sources) {
      try {
        await syncEpgSource(source.id);
        synced++;
      } catch (e) {
        errors.push(`${source.name}: ${e instanceof Error ? e.message : "sync failed"}`);
      }
    }
    await cacheDel("epg*");
    return NextResponse.json({ ok: true, synced, total: sources.length, errors: errors.slice(0, 30) });
  }

  if (body.sync && body.sourceId) {
    try {
      const count = await syncEpgSource(body.sourceId);
      return NextResponse.json({ ok: true, programsImported: count });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Sync failed" },
        { status: 500 }
      );
    }
  }

  const source = await prisma.epgSource.create({
    data: {
      name: body.name,
      url: body.url,
      country: body.country || null,
      syncEveryHours: body.syncEveryHours != null ? Number(body.syncEveryHours) : 24,
    },
  });
  await cacheDel("epg");
  return NextResponse.json({ source });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.epgSource.delete({ where: { id } });
  await cacheDel("epg");
  return NextResponse.json({ ok: true });
}
