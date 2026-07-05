import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getViewerHeatmap, getPeakViewingTimes } from "@/lib/viewer-heatmap";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [heatmap, peaks] = await Promise.all([
    getViewerHeatmap(),
    getPeakViewingTimes(),
  ]);

  return NextResponse.json({ heatmap, peaks });
}
