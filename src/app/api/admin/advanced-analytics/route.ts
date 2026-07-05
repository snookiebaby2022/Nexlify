import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getAdvancedAnalytics } from "@/lib/advanced-analytics";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const analytics = await getAdvancedAnalytics();
  return NextResponse.json(analytics);
}
