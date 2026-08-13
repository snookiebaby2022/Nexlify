import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const announcements = await prisma.announcement.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, message: true, type: true },
  });
  return NextResponse.json({ announcements });
}
