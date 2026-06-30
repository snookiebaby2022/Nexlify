import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { rankServersForClient } from "@/lib/intelligent-lb";
import { getServerLoadScores } from "@/lib/server-load";
import { isLbProEnabled } from "@/lib/intelligent-lb";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientIp = req.nextUrl.searchParams.get("testIp") ?? undefined;
  const [scores, ranked, streamSettings, lbProSettings, lbProEnabled] = await Promise.all([
    getServerLoadScores(),
    rankServersForClient(clientIp || undefined),
    getSettingGroup("streams"),
    getSettingGroup("lb-pro" as never),
    isLbProEnabled(),
  ]);

  const servers = scores.map((x) => ({
    id: x.server.id,
    name: x.server.name,
    host: x.server.host,
    connections: x.slotsUsed,
    bandwidthMbps: x.server.bandwidthMbps ?? Math.round(x.score * 100),
    maxCapacity: x.slots,
    loadScore: Math.round(x.score * 100),
    healthStatus: x.server.healthStatus,
    online: x.online,
    region: x.server.region,
    geoCountries: x.server.geoLbCountries,
  }));

  const rankedById = new Map(ranked.map((r) => [r.serverId, r]));

  return NextResponse.json({
    servers: servers.map((s) => ({
      ...s,
      rankReasons: rankedById.get(s.id)?.reasons ?? [],
      rankScore: rankedById.get(s.id)?.score ?? s.loadScore,
    })),
    config: {
      loadBalancing: streamSettings.loadBalancing,
      geoLoadBalancing: streamSettings.geoLoadBalancing,
      loadBalancingRestriction: streamSettings.loadBalancingRestriction,
      lbProEnabled,
      lbPro: lbProSettings,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (body.streams) {
    const current = await getSettingGroup("streams");
    await setSettingGroup("streams", { ...current, ...body.streams });
  }
  if (body.lbPro) {
    const current = await getSettingGroup("lb-pro" as never);
    await setSettingGroup("lb-pro" as never, { ...current, ...body.lbPro });
  }
  return NextResponse.json({ ok: true });
}
