import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { convertMagDevicesToLines } from "@/lib/mag-convert-to-line";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

  try {
    const result = await convertMagDevicesToLines(session, ids);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Convert failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
