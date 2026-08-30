import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { getServerLoadScores } from "@/lib/server-load";
import { listLiveConnections } from "@/lib/connections";
import { batchGetLiveQualitySamples } from "@/lib/connection-quality-live";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ownerId = session.role === "ADMIN" ? undefined : session.id;
  const [scores, rows] = await Promise.all([
    getServerLoadScores(),
    listLiveConnections(ownerId, 400),
  ]);
  const samples = await batchGetLiveQualitySamples(
    rows.map((c) => ({ lineId: c.lineId, streamId: c.streamId ?? "", ip: c.ip }))
  );

  let stallSessions = 0;
  let ttfpSum = 0;
  let ttfpN = 0;
  for (let i = 0; i < rows.length; i++) {
    const live = samples[i];
    if (!live?.hasSamples) continue;
    if ((live.stallCount ?? 0) > 0) stallSessions += 1;
    const started = rows[i]!.startedAt instanceof Date ? rows[i]!.startedAt.getTime() : new Date(rows[i]!.startedAt).getTime();
    if (Number.isFinite(started) && live.firstByteAt) {
      ttfpSum += Math.max(0, live.firstByteAt - started);
      ttfpN += 1;
    }
  }

  const ctx = buildServerRoleContext(scores.map((s) => s.server));
  const lbs = scores.filter((s) => s.online && resolveServerRole(s.server, ctx) === "lb");
  const pool = lbs.length ? lbs : [];
  const saturated = pool.filter((s) => s.saturated);
  const worst = pool.slice().sort((a, b) => a.headroomPct - b.headroomPct)[0];

  return NextResponse.json({
    liveConnections: rows.length,
    stallSessions,
    avgFirstPictureMs: ttfpN ? Math.round(ttfpSum / ttfpN) : null,
    servers: pool.length,
    saturatedServers: saturated.length,
    worstHeadroomPct: worst?.headroomPct ?? 100,
    worstServerName: worst?.server.name ?? null,
    capMbps: pool.reduce((n, s) => n + s.capMbps, 0),
    usedMbps: Math.round(pool.reduce((n, s) => n + s.bandwidthMbps, 0) * 10) / 10,
    lbNames: pool.map((s) => s.server.name),
  });
}
