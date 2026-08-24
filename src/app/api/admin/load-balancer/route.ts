import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getAllServerMetrics, selectBestServer, getServerHealthStatus, enforceLoadBalance, setServerMetrics } from "@/lib/load-balancer";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const authSession = await requireSession([PanelRole.ADMIN]);
  if (!authSession) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
