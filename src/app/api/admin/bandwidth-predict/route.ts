import { NextRequest, NextResponse } from "next/server";
import { predictBandwidth, getBandwidthHistory, getBandwidthStats, recordBandwidthUsage } from "@/lib/bandwidth-predictor";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "predict") {
      const hours = Number(sp.get("hours") ?? 1);
      return NextResponse.json(await predictBandwidth(hours));
    }
    if (action === "history") {
      const hours = Number(sp.get("hours") ?? 24);
      return NextResponse.json(await getBandwidthHistory(hours));
    }
    if (action === "stats") {
      return NextResponse.json(await getBandwidthStats());
    }
    return NextResponse.json(await getBandwidthStats());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    if (body.action === "record") {
      await recordBandwidthUsage(body.totalMbps, body.connections);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
