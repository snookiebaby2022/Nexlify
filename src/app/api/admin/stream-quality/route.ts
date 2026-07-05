import { NextRequest, NextResponse } from "next/server";
import { getAllStreamQualities, getStreamQuality, updateStreamQuality, getQualityDistribution } from "@/lib/stream-quality";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "all") return NextResponse.json(await getAllStreamQualities());
    if (action === "distribution") return NextResponse.json(await getQualityDistribution());
    const streamId = sp.get("streamId");
    if (streamId) return NextResponse.json(await getStreamQuality(streamId));
    return NextResponse.json(await getAllStreamQualities());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    if (body.action === "update") {
      await updateStreamQuality(body.streamId, body.metrics);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
