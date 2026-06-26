import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { validateStreamCreate } from "@/lib/stream-source";
import { buildStreamCreateData } from "@/lib/stream-create-data";
import { probeMediaFile } from "@/lib/media-probe";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const stream = await prisma.stream.findUnique({
    where: { id },
    include: { category: true, server: true, provider: true },
  });
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ stream });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.stream.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const merged = {
    ...existing,
    ...body,
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    source: body.source ?? body.streamUrl ?? existing.streamUrl,
    seriesName: body.seriesName ?? existing.seriesName,
    seasonNum: body.seasonNum ?? existing.seasonNum,
    episodeNum: body.episodeNum ?? existing.episodeNum,
  };

  const err = validateStreamCreate(merged);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const { data, absolutePath } = await buildStreamCreateData({
      ...merged,
      name: merged.name,
    });

    let probe = null;
    if (absolutePath) {
      probe = await probeMediaFile(absolutePath);
    }

    const stream = await prisma.stream.update({
      where: { id },
      data: {
        ...data,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      },
      include: { provider: true },
    });
    const { cacheDel } = await import("@/lib/cache");
    await cacheDel(`playback:url:`);
    return NextResponse.json({ stream, probe });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update stream" },
      { status: 400 }
    );
  }
}
