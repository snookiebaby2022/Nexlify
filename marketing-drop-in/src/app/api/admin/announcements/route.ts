import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ announcements });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, message, type, active } = body;

  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Title and message required" }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title.trim(),
      message: message.trim(),
      type: type || "info",
      active: active !== false,
    },
  });

  return NextResponse.json({ ok: true, announcement });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, title, message, type, active } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(message !== undefined && { message: message.trim() }),
      ...(type !== undefined && { type }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json({ ok: true, announcement });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
