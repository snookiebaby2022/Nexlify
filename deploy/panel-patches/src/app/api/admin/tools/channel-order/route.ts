import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const streams = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      ...(categoryId ? { categoryId } : {}),
    },
    select: { id: true, name: true, sortOrder: true, categoryId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ streams });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const order: string[] = body.order ?? [];
  await Promise.all(
    order.map((id, index) =>
      prisma.stream.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("categories");
  return NextResponse.json({ ok: true, count: order.length });
}
