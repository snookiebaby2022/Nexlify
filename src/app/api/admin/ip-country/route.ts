import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { extractHostname, extractIpAddress, isPublicIp, normalizeCountryCode } from "@/lib/ip-country";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { resolveServerHostGeo } from "@/lib/server-host-geo";

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
  const literal = extractIpAddress(raw);
  const host = extractHostname(raw);
  if (!literal && !host) {
    return NextResponse.json({ countryCode: null, ip: null });
  }

  if (literal && !isPublicIp(literal)) {
    return NextResponse.json({ countryCode: null, ip: literal, private: true });
  }

  const geo = await resolveServerHostGeo(raw);
  return NextResponse.json({
    countryCode: normalizeCountryCode(geo.countryCode),
    countryName: geo.countryName,
    ip: geo.ip,
  });
}
