import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { predictBandwidth, getBandwidthHistory, getBandwidthStats, recordBandwidthUsage } from "@/lib/bandwidth-predictor";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  try {
    if (body.action === "record") {
      await recordBandwidthUsage(body.totalMbps, body.connections);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
