import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getUpcomingSportsFixtures } from "@/lib/live-sports";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { matches, configured, providerCount } = await getUpcomingSportsFixtures();
  return NextResponse.json({ matches, configured, providerCount });
}
