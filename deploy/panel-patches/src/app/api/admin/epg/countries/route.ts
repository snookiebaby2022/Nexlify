import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { EPG_COUNTRIES } from "@/lib/epg-countries";
import { syncEpgSource } from "@/lib/epg";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/cache";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.epgSource.findMany({
    where: { country: { not: null } },
    select: { country: true, id: true, lastSync: true, _count: { select: { programs: true } } },
  });
  const map = new Map(existing.map((e) => [e.country!, e]));

  const countries = EPG_COUNTRIES.map((c) => ({
    ...c,
    imported: map.has(c.code),
    sourceId: map.get(c.code)?.id,
    lastSync: map.get(c.code)?.lastSync,
    programs: map.get(c.code)?._count.programs ?? 0,
  }));

  return NextResponse.json({ countries, total: countries.length });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const sync = body.sync === true;
  const forceSync = body.forceSync === true;
  const codes: string[] = body.all
    ? EPG_COUNTRIES.map((c) => c.code)
    : Array.isArray(body.codes)
      ? body.codes
      : [];

  let added = 0;
  let synced = 0;
  const errors: string[] = [];

  for (const code of codes) {
    const meta = EPG_COUNTRIES.find((c) => c.code === code);
    if (!meta) continue;

    const source = await prisma.epgSource.upsert({
      where: { id: `epg-country-${code}` },
      update: { url: meta.url, name: `${meta.name} EPG`, country: code, isActive: true },
      create: {
        id: `epg-country-${code}`,
        name: `${meta.name} EPG`,
        url: meta.url,
        country: code,
        isActive: true,
      },
    });
    added++;

    if (sync || forceSync) {
      try {
        if (forceSync) {
          await syncEpgSource(source.id);
        } else {
          await syncEpgSource(source.id);
        }
        synced++;
      } catch (e) {
        errors.push(`${code}: ${e instanceof Error ? e.message : "sync failed"}`);
      }
    }
  }

  await cacheDel("epg*");

  return NextResponse.json({ added, synced, errors: errors.slice(0, 20) });
}
