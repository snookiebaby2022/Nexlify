import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { detectServerHardware } from "@/lib/server-hardware";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...detectServerHardware() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Detect failed" },
      { status: 500 }
    );
  }
}
