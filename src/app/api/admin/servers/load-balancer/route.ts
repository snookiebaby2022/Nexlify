import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { rankServersForClient } from "@/lib/intelligent-lb";
import { getServerLoadScores, rebalanceLiveStreamsAcrossServers } from "@/lib/server-load";
import { isLbProEnabled } from "@/lib/intelligent-lb";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientIp = req.nextUrl.searchParams.get("testIp") ?? undefined;
  try {
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
    connections: x.liveConnections,
    catalogAssigned: x.catalogAssigned,
    bandwidthMbps: x.bandwidthMbps,
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
      autoRebalanceLive: streamSettings.autoRebalanceLive ?? "off",
      autoRebalanceIncludeMain: streamSettings.autoRebalanceIncludeMain === true,
      lbProEnabled,
      lbPro: lbProSettings,
    },
  });
  } catch (e) {
    return NextResponse.json({
      servers: [],
      config: null,
      error: e instanceof Error ? e.message : "Load balancer unavailable",
    });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.streams) {
    const current = await getSettingGroup("streams");
    await setSettingGroup("streams", { ...current, ...body.streams });
  }
  if (body.lbPro) {
    const current = await getSettingGroup("lb-pro" as never);
    await setSettingGroup("lb-pro" as never, { ...current, ...body.lbPro });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    if (String(body.action) !== "rebalance_now") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const settings = await getSettingGroup("streams");
    const includeMain =
      body.includeMain === true || settings.autoRebalanceIncludeMain === true;

    const result = await rebalanceLiveStreamsAcrossServers({
      includeMain,
      force: true,
      maxMoves: typeof body.maxMoves === "number" ? body.maxMoves : 120,
    });

    return NextResponse.json({
      ok: true,
      moved: result.moved,
      servers: result.servers,
      message:
        result.moved > 0
          ? `Moved ${result.moved} live stream(s) across ${result.servers} server(s)`
          : "No rebalance needed (servers already balanced or fewer than 2 eligible servers)",
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
