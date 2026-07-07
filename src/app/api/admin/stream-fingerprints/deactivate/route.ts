import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.streamFingerprint.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
