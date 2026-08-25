import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  clearActiveConnections,
  deleteActiveConnection,
  listLiveConnections,
  pruneStaleConnections,
  PLAYBACK_STALE_MS,
} from "@/lib/connections";
import { computeConnectionQualityWithLive, batchGetLiveQualitySamples } from "@/lib/connection-quality-live";
import {
  batchGetConnectionPlaybackOutputs,
  resolvePlaybackOutputLabel,
} from "@/lib/connection-playback-output";
import { streamServerDisplayName } from "@/lib/stream-server-display";
import { PanelRole } from "@prisma/client";
import { ownerScope } from "@/lib/owner-scope";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  void pruneStaleConnections(PLAYBACK_STALE_MS);
  const connections = await listLiveConnections(ownerScope(session));
  const now = Date.now();
  const qualityItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const outputItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const [liveSamples, cachedOutputs] = await Promise.all([
    batchGetLiveQualitySamples(qualityItems, now),
    batchGetConnectionPlaybackOutputs(outputItems),
  ]);
  const mapped = connections.map((c, i) => {
    const live = c.streamId ? liveSamples[i] : null;
    const quality = computeConnectionQualityWithLive({
      startedAt: c.startedAt,
      lastSeenAt: c.lastSeenAt,
      now,
      live,
    });
    const cachedOutput = c.streamId ? cachedOutputs[i] : null;
    const output = resolvePlaybackOutputLabel({
      cached: cachedOutput,
      userAgent: c.userAgent,
    });
    const srv = c.stream?.server;
    const serverName = srv
      ? streamServerDisplayName(srv.name, srv.domain || srv.host || "")
      : "Main Server";
    return {
      ...c,
      startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
      lastSeenAt: c.lastSeenAt instanceof Date ? c.lastSeenAt.toISOString() : String(c.lastSeenAt),
      serverName,
      quality,
      output,
    };
  });
  return NextResponse.json({ connections: mapped });
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  const scope = ownerScope(session);

  if (id === "all") {
    await clearActiveConnections(scope);
    return NextResponse.json({ ok: true });
  }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await deleteActiveConnection(id, scope);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
