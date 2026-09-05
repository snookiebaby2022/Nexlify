import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveProbeTargetUrl } from "@/lib/resolve-probe-url";
import { probeStreamWithScheduler } from "@/lib/source-probe-scheduler";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { decideProbePersist } from "@/lib/stream-probe-persist";

const MAX_IDS = 50;
const CONCURRENCY = 4;

type ProbeRow = {
  lastProbeOk: boolean;
  lastProbeError: string | null;
  probe: { status: string; message: string; latencyMs?: number };
};

async function probeStreamRow(streamId: string, fast: boolean): Promise<ProbeRow | { error: string }> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { provider: true, server: true },
  });
  if (!stream) return { error: "Stream not found" };

  const resolved = await resolveProbeTargetUrl(stream.streamUrl, stream);
  const url = resolved.url || stream.streamUrl;
  const { probe, skipped } = await probeStreamWithScheduler({ streamId: stream.id, url, fast });
  const persist = decideProbePersist({ skipped, fast, probe });
  let effective = persist;
  let usedBackup = false;
  let activeProbe = probe;

  const primaryOk =
    !skipped && (probe.status === "online" || probe.status === "degraded");

  // Always try failover when primary is not healthy — including fast HEAD fails
  // that do not persist, so Offline / repair can clear via a working backup.
  if (!primaryOk && stream.backupUrl?.trim()) {
    const backupResolved = await resolveProbeTargetUrl(stream.backupUrl.trim(), stream);
    const backupUrl = backupResolved.url || stream.backupUrl.trim();
    const backup = await probeStreamWithScheduler({ streamId: stream.id, url: backupUrl, fast: false });
    const backupPersist = decideProbePersist({ skipped: backup.skipped, fast: false, probe: backup.probe });
    if (backupPersist.write && backupPersist.lastProbeOk) {
      effective = {
        skipped: false,
        write: true,
        lastProbeOk: true,
        lastProbeError: null,
      };
      usedBackup = true;
      activeProbe = backup.probe;
    }
  }

  const lastProbeError =
    effective.write && effective.lastProbeError !== undefined
      ? effective.lastProbeError
      : primaryOk || usedBackup
        ? null
        : activeProbe.message ?? "Probe failed";
  if (effective.write) {
    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        lastProbeAt: new Date(),
        lastProbeOk: effective.lastProbeOk,
        lastProbeError: effective.lastProbeError ?? lastProbeError,
      },
    });
    if (effective.lastProbeOk) {
      const { markStreamViewerPlaybackOk } = await import("@/lib/viewer-playback-probe");
      await markStreamViewerPlaybackOk(stream.id).catch(() => {});
    }
  }

  const reportedOk = effective.write
    ? Boolean(effective.lastProbeOk)
    : primaryOk
      ? true
      : stream.lastProbeOk === true;

  return {
    lastProbeOk: reportedOk,
    lastProbeError: effective.write
      ? effective.lastProbeError ?? lastProbeError
      : primaryOk
        ? null
        : stream.lastProbeError,
    probe: {
      status: usedBackup ? "online" : activeProbe.status,
      message: usedBackup
        ? "Backup URL is online"
        : skipped
          ? activeProbe.message ?? "Probe deferred"
          : activeProbe.message ?? "",
      latencyMs: activeProbe.latencyMs,
    },
  };
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
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
    const rawIds: unknown[] = Array.isArray(body.streamIds) ? body.streamIds : [];
    const streamIds = [
      ...new Set(
        rawIds
          .map((id: unknown) => String(id).trim())
          .filter((id): id is string => id.length > 0)
      ),
    ].slice(0, MAX_IDS);
    if (!streamIds.length) {
      return NextResponse.json({ error: "streamIds required" }, { status: 400 });
    }

    const fast = body.fast !== false;
    const rows = await mapPool(streamIds, CONCURRENCY, (id) => probeStreamRow(id, fast));
    const results: Record<string, ProbeRow | { error: string }> = {};
    streamIds.forEach((id, idx) => {
      results[id] = rows[idx];
    });

    const { invalidateDashboardStats } = await import("@/lib/cache-invalidate");
    await invalidateDashboardStats().catch(() => {});

    return NextResponse.json({ results, fast });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
