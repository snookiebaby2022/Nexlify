import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { lookupGeo } from "@/lib/geoip";
import { extractIpAddress, isPublicIp } from "@/lib/ip-country";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("ip")?.trim() ?? "";
  const ip = extractIpAddress(raw);
  if (!ip || !isPublicIp(ip)) {
    return NextResponse.json({ countryCode: null });
  }

  const geo = await lookupGeo(ip);
  return NextResponse.json({
    countryCode: geo?.countryCode ?? null,
    countryName: geo?.countryName ?? null,
  });
}
