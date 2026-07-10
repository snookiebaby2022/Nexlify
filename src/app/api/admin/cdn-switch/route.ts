import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { probeAllCdns, selectBestCdn, getCdnMetrics } from "@/lib/smart-cdn";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "best") {
      const best = await selectBestCdn();
      return NextResponse.json(best);
    }
    if (action === "probe") {
      const results = await probeAllCdns();
      return NextResponse.json(results);
    }
    const cdnId = sp.get("cdnId");
    if (cdnId) return NextResponse.json(await getCdnMetrics(cdnId));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  try {
    if (body.action === "add") {
      const name = String(body.name ?? "").trim().slice(0, 100);
      const url = String(body.url ?? "").trim().slice(0, 500);
      if (!name || !url) {
        return NextResponse.json({ error: "name and url are required" }, { status: 400 });
      }
      try { new URL(url); } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }
      const ep = await prisma.cdnEndpoint.create({
        data: {
          name,
          url,
          priority: Math.max(0, Math.min(100, Number(body.priority) || 0)),
          isActive: body.isActive !== false,
          region: String(body.region ?? "global").slice(0, 50),
          maxBandwidthMbps: Math.max(1, Math.min(100000, Number(body.maxBandwidthMbps) || 1000)),
        },
      });
      return NextResponse.json(ep);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
