import { NextRequest, NextResponse } from "next/server";
import { getAllServerMetrics, selectBestServer, getServerHealthStatus, enforceLoadBalance, setServerMetrics } from "@/lib/load-balancer";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "metrics") return NextResponse.json(await getAllServerMetrics());
    if (action === "health") return NextResponse.json(await getServerHealthStatus());
    if (action === "best") {
      const exclude = sp.get("exclude") ?? undefined;
      return NextResponse.json(await selectBestServer(exclude));
    }
    return NextResponse.json(await getServerHealthStatus());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  try {
    if (action === "update-metrics") {
      await setServerMetrics(body.metrics);
      return NextResponse.json({ ok: true });
    }
    if (action === "enforce") {
      const result = await enforceLoadBalance();
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
