import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listActiveConnections } from "@/lib/connections";
import { lookupGeoExtended } from "@/lib/connection-map-geo";
import { ownerScope } from "@/lib/owner-scope";
import { PanelRole } from "@prisma/client";
import { extractIpAddress, isPublicIp } from "@/lib/ip-country";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connections = await listActiveConnections(ownerScope(session));
  const byCountry = new Map<
    string,
    { countryCode: string; countryName: string | null; count: number; mapX: number; mapY: number }
  >();
  const points: {
    id: string;
    ip: string;
    countryCode: string | null;
    countryName: string | null;
    mapX: number;
    mapY: number;
    line: string;
    stream: string | null;
  }[] = [];

  for (const c of connections) {
    const ip = c.ip ? extractIpAddress(c.ip) : null;
    let geo = { countryCode: null as string | null, countryName: null as string | null, mapX: 50, mapY: 40 };
    if (ip && isPublicIp(ip)) {
      const g = await lookupGeoExtended(ip);
      geo = {
        countryCode: g.countryCode,
        countryName: g.countryName,
        mapX: g.mapX,
        mapY: g.mapY,
      };
    }
    const cc = geo.countryCode ?? "??";
    const bucket = byCountry.get(cc) ?? {
      countryCode: cc,
      countryName: geo.countryName,
      count: 0,
      mapX: geo.mapX,
      mapY: geo.mapY,
    };
    bucket.count += 1;
    byCountry.set(cc, bucket);

    points.push({
      id: c.id,
      ip: ip ?? c.ip ?? "",
      countryCode: geo.countryCode,
      countryName: geo.countryName,
      mapX: geo.mapX + (Math.random() - 0.5) * 3,
      mapY: geo.mapY + (Math.random() - 0.5) * 3,
      line: c.line.username,
      stream: c.stream?.name ?? null,
    });
  }

  return NextResponse.json({
    total: connections.length,
    countries: Array.from(byCountry.values()).sort((a, b) => b.count - a.count),
    points,
  });
}
