import { NextRequest, NextResponse } from "next/server";
import { getTopEngagedStreams, getChannelTrends, getEngagementDashboard, getStreamEngagement } from "@/lib/viewer-engagement";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "top") {
      const limit = Number(sp.get("limit") ?? 10);
      return NextResponse.json(await getTopEngagedStreams(limit));
    }
    if (action === "trends") return NextResponse.json(await getChannelTrends());
    if (action === "dashboard") return NextResponse.json(await getEngagementDashboard());
    const streamId = sp.get("streamId");
    if (streamId) return NextResponse.json(await getStreamEngagement(streamId));
    return NextResponse.json(await getEngagementDashboard());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
