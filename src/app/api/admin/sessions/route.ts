import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getActiveSessions, addSession, removeSession, heartbeatSession, checkSessionAllowed, getSessionPolicy, cleanupStaleSessions } from "@/lib/session-management";
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
    if (action === "sessions") {
      const lineId = sp.get("lineId");
      if (!lineId) return NextResponse.json({ error: "Missing lineId" }, { status: 400 });
      return NextResponse.json(await getActiveSessions(lineId));
    }
    if (action === "policy") {
      const lineId = sp.get("lineId");
      if (!lineId) return NextResponse.json({ error: "Missing lineId" }, { status: 400 });
      return NextResponse.json(await getSessionPolicy(lineId));
    }
    if (action === "check") {
      const lineId = sp.get("lineId");
      const ip = sp.get("ip");
      const streamId = sp.get("streamId");
      const deviceId = sp.get("deviceId");
      if (!lineId || !ip || !streamId) return NextResponse.json({ error: "Missing params" }, { status: 400 });
      return NextResponse.json(await checkSessionAllowed(lineId, ip, streamId, deviceId));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const action = String(body.action ?? "");
  try {
    if (action === "add") {
      await addSession(body.session);
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      await removeSession(body.lineId, body.ip, body.streamId);
      return NextResponse.json({ ok: true });
    }
    if (action === "heartbeat") {
      await heartbeatSession(body.lineId, body.ip, body.streamId);
      return NextResponse.json({ ok: true });
    }
    if (action === "cleanup") {
      const cleaned = await cleanupStaleSessions(body.lineId);
      return NextResponse.json({ cleaned });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
