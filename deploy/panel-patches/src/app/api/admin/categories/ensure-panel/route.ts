import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensurePanelCategory } from "@/lib/ensure-panel-category";
import { PanelRole } from "@prisma/client";

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePanelCategory();
  return NextResponse.json({ ok: true });
}
