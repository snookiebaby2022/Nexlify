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
      const ep = await prisma.cdnEndpoint.create({
        data: {
          name: body.name,
          url: body.url,
          priority: body.priority ?? 0,
          isActive: body.isActive ?? true,
          region: body.region ?? "global",
          maxBandwidthMbps: body.maxBandwidthMbps ?? 1000,
        },
      });
      return NextResponse.json(ep);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
