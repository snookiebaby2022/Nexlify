import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { getPlaybackTopologyReport } from "@/lib/playback-topology-probe";
import { publicOriginFromRequest } from "@/lib/public-origin";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const origin = publicOriginFromRequest(req.url, req.headers);
  const report = await getPlaybackTopologyReport({
    probeEdgeHealth: true,
    panelOrigin: origin,
  });
  return NextResponse.json(report);
}
