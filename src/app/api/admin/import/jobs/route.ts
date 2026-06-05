import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobs = await prisma.importJob.findMany({
    take: 30,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ jobs });
}
