import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getCatchupSettings, updateCatchupSettings, getAvailableCatchup, getCatchupStreamUrl, cleanupExpiredRecordings, getStorageUsage } from "@/lib/catchup-tv";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "settings") return NextResponse.json(await getCatchupSettings());
    if (action === "storage") return NextResponse.json(await getStorageUsage());
    if (action === "available") {
      const streamId = sp.get("streamId");
      if (!streamId) return NextResponse.json({ error: "Missing streamId" }, { status: 400 });
      const start = Number(sp.get("start") ?? Date.now() - 86400000);
      const end = Number(sp.get("end") ?? Date.now());
      return NextResponse.json(await getAvailableCatchup(streamId, start, end));
    }
    if (action === "stream-url") {
      const recordingId = sp.get("recordingId");
      const panelOrigin = sp.get("origin");
      const username = sp.get("username");
      const password = sp.get("password");
      if (!recordingId || !panelOrigin || !username || !password)
        return NextResponse.json({ error: "Missing params" }, { status: 400 });
      const url = await getCatchupStreamUrl(recordingId, panelOrigin, username, password);
      return NextResponse.json({ url });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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

  const { action } = body;
  try {
    if (action === "update-settings") {
      await updateCatchupSettings(body.settings);
      return NextResponse.json({ ok: true });
    }
    if (action === "cleanup") {
      const cleaned = await cleanupExpiredRecordings();
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
