import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { resolveServerUrls } from "@/lib/server-urls";
import { publicOriginFromRequest } from "@/lib/public-origin";
import { PanelRole } from "@prisma/client";

/** Resolved panel / MAG / Enigma URLs for admin and reseller UIs. */
export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const origin = publicOriginFromRequest(req.url, req.headers);
  const urls = await resolveServerUrls(origin);
  return NextResponse.json(urls);
}
