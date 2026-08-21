import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { isSessionKicked } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return new NextResponse(null, { status: 403 });
  }

  const lineId = req.nextUrl.searchParams.get("lineId")?.trim() ?? "";
  const ip = req.nextUrl.searchParams.get("ip");
  if (!lineId) return NextResponse.json({ kicked: false });

  const kicked = await isSessionKicked(lineId, ip);
  return NextResponse.json({ kicked });
}
