import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fingerprints = await prisma.streamFingerprint.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const stats = {
    total: fingerprints.length,
    active: fingerprints.filter((f) => f.isActive).length,
    inactive: fingerprints.filter((f) => !f.isActive).length,
  };

  return NextResponse.json({ fingerprints, stats });
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
