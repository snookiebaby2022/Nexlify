import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getActiveSessions, addSession, removeSession, heartbeatSession, checkSessionAllowed, getSessionPolicy, cleanupStaleSessions } from "@/lib/session-management";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
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
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
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
}
