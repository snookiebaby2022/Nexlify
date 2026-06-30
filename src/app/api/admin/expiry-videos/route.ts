import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const isActive = searchParams.get("isActive");
  const language = searchParams.get("language");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (isActive !== null) where.isActive = isActive === "true";
  if (language) where.language = language;

  const videos = await prisma.expiryVideo.findMany({
    where,
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ videos });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const videoUrl = String(body.videoUrl ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!videoUrl) return NextResponse.json({ error: "videoUrl required" }, { status: 400 });

  const isDefault = Boolean(body.isDefault);
  const type = String(body.type ?? "generic").trim();
  const language = String(body.language ?? "en").trim();

  if (isDefault) {
    await prisma.expiryVideo.updateMany({
      where: { type, language, isDefault: true },
      data: { isDefault: false },
    });
  }

  const video = await prisma.expiryVideo.create({
    data: {
      name,
      videoUrl,
      type,
      language,
      isDefault,
      sortOrder: Number(body.sortOrder ?? 0),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    },
  });

  return NextResponse.json({ video });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name);
  if (body.videoUrl !== undefined) data.videoUrl = String(body.videoUrl);
  if (body.type !== undefined) data.type = String(body.type);
  if (body.language !== undefined) data.language = String(body.language);
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const isDefault = body.isDefault !== undefined ? Boolean(body.isDefault) : undefined;
  if (isDefault !== undefined) {
    data.isDefault = isDefault;
    if (isDefault) {
      const target = await prisma.expiryVideo.findUnique({ where: { id } });
      if (target) {
        await prisma.expiryVideo.updateMany({
          where: { type: target.type, language: target.language, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
    }
  }

  const video = await prisma.expiryVideo.update({
    where: { id },
    data,
  });

  return NextResponse.json({ video });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.expiryVideo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
