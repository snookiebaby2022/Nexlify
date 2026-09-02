import { NextRequest, NextResponse } from "next/server";
import { pulseLiveConnectionBatch } from "@/lib/connection-pulse-batch";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return new NextResponse(null, { status: 403 });
  }
  let body: { sessions?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  const raw = Array.isArray(body.sessions) ? body.sessions : [];
  const sessions = raw
    .map((row) => {
      const r = row as Record<string, unknown>;
      const lineId = String(r.lineId ?? "").trim();
      const streamId = String(r.streamId ?? "").trim();
      if (!lineId || !streamId) return null;
      return {
        lineId,
        streamId,
        ip: r.ip != null ? String(r.ip) : null,
        bytes: Math.max(0, Math.floor(Number(r.bytes ?? 0))),
        idleMs: Math.max(0, Math.floor(Number(r.idleMs ?? 0))),
        onDemand: String(r.onDemand ?? "") === "1" || r.onDemand === true,
      };
    })
    .filter(Boolean) as Array<{
    lineId: string;
    streamId: string;
    ip?: string | null;
    bytes?: number;
    idleMs?: number;
    onDemand?: boolean;
  }>;
  const applied = await pulseLiveConnectionBatch(sessions);
  return NextResponse.json({ ok: true, applied });
}
