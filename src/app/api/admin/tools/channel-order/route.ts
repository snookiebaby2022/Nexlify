import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";

function parseType(raw: string | null): StreamType {
  const t = String(raw ?? "LIVE").toUpperCase();
  if (t === "MOVIE") return StreamType.MOVIE;
  if (t === "SERIES") return StreamType.SERIES;
  return StreamType.LIVE;
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const type = parseType(req.nextUrl.searchParams.get("type"));

  const streams = await prisma.stream.findMany({
    where: {
      type,
      ...(categoryId ? { categoryId } : {}),
      // Live list excludes radio channels for channel-order UX
      ...(type === StreamType.LIVE ? { isRadio: false } : {}),
    },
    select: { id: true, name: true, sortOrder: true, categoryId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    // Cap unfiltered loads so "All categories" does not stall the UI
    take: categoryId ? 20_000 : 5_000,
  });
  return NextResponse.json({ streams, type });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const order: string[] = body.order ?? [];
  if (!order.length) return NextResponse.json({ error: "order required" }, { status: 400 });

  await Promise.all(
    order.map((id, index) => prisma.stream.update({ where: { id }, data: { sortOrder: index } }))
  );
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("categories");
  return NextResponse.json({ ok: true, count: order.length });
}
