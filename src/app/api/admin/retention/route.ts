import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getViewerRetention, getChannelAnalytics, getUsageForecast, getDashboardRetentionSummary } from "@/lib/retention-analytics";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "retention") {
      const streamId = sp.get("streamId");
      if (!streamId) return NextResponse.json({ error: "Missing streamId" }, { status: 400 });
      return NextResponse.json(await getViewerRetention(streamId));
    }
    if (action === "channel") {
      const streamId = sp.get("streamId");
      if (!streamId) return NextResponse.json({ error: "Missing streamId" }, { status: 400 });
      return NextResponse.json(await getChannelAnalytics(streamId));
    }
    if (action === "forecast") {
      const metric = (sp.get("metric") ?? "connections") as "connections" | "bandwidth" | "streams";
      return NextResponse.json(await getUsageForecast(metric));
    }
    if (action === "summary") {
      return NextResponse.json(await getDashboardRetentionSummary());
    }
    return NextResponse.json(await getDashboardRetentionSummary());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
