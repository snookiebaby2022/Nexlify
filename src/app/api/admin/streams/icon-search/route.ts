import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { resolveAutoChannelLogo } from "@/lib/channel-logo";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const epgId = req.nextUrl.searchParams.get("epgId")?.trim() || null;

  try {
    const logo = await resolveAutoChannelLogo(name, { epgChannelId: epgId });
    return NextResponse.json({ logo });
  } catch (err) {
    return NextResponse.json({ logo: null, error: err instanceof Error ? err.message : "Failed" });
  }
}
