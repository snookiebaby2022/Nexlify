import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { pulseLiveConnection } from "@/lib/connection-pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return new NextResponse(null, { status: 403 });
  }

  let body: { lineId?: string; streamId?: string; ip?: string; bytes?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const lineId = String(body.lineId ?? "").trim();
  const streamId = String(body.streamId ?? "").trim();
  if (!lineId || !streamId) {
    return new NextResponse("lineId and streamId required", { status: 400 });
  }

  await pulseLiveConnection({
    lineId,
    streamId,
    ip: body.ip ?? null,
    bytes: body.bytes,
  }).catch(() => undefined);

  return new NextResponse(null, { status: 204 });
}
