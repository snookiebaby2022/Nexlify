import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createSyncReporter,
  isSyncJobActive,
  readSyncProgress,
  resolveSyncProgress,
  SYNC_STALE_MS,
} from "@/lib/integration-sync-progress";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";
import { importPlexLibrary } from "@/lib/media-integrations";
import { resolvePlaybackLoadBalancerId } from "@/lib/server-load";

function asConfig(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

let pumping = false;

export function plexSyncIsBusy(): boolean {
  return pumping;
}

function queuedProgress(jobId: string): IntegrationSyncProgress {
  const at = new Date().toISOString();
  const message = "Queued. Sync worker starts in a few seconds…";
  return {
    jobId,
    status: "running",
    phase: "queued",
    message,
    current: 0,
    total: 0,
    imported: 0,
    skipped: 0,
    episodes: 0,
    titleCurrent: 0,
    titleTotal: 0,
    steps: [{ at, text: message }],
    updatedAt: at,
  };
}

export async function enqueuePlexSync(
  integrationId: string,
  serverId?: string | null
): Promise<{ alreadyRunning: boolean; jobId: string; progress: IntegrationSyncProgress | null }> {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "plex") throw new Error("Plex integration not found");

  const live = await resolveSyncProgress(row.config, row.id);
  if (live && isSyncJobActive(live, SYNC_STALE_MS)) {
    return { alreadyRunning: true, jobId: live.jobId, progress: live };
  }

  const jobId = randomUUID();
  const progress = queuedProgress(jobId);
  const cfg = asConfig(row.config);
  const resolved = await resolvePlaybackLoadBalancerId(
    serverId ?? (cfg.serverId ? String(cfg.serverId) : null)
  );
  cfg.syncQueued = true;
  cfg.syncJobId = jobId;
  cfg.syncServerId = resolved;
  cfg.serverId = resolved;
  cfg.syncProgress = progress;
  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { config: cfg as Prisma.InputJsonValue },
  });
  return { alreadyRunning: false, jobId, progress };
}

async function claimNextPlexSync(): Promise<{
  id: string;
  jobId: string;
  serverId: string | null;
} | null> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "MediaIntegration"
        WHERE type = 'plex' AND (config->>'syncQueued') = 'true'
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const id = locked[0]?.id;
      if (!id) return null;
      const row = await tx.mediaIntegration.findUnique({ where: { id } });
      if (!row) return null;
      const cfg = asConfig(row.config);
      if (cfg.syncQueued !== true) return null;
      const progress = readSyncProgress(cfg);
      const jobId = String(cfg.syncJobId ?? progress?.jobId ?? "") || randomUUID();
      const at = new Date().toISOString();
      const starting: IntegrationSyncProgress = {
        ...(progress ?? queuedProgress(jobId)),
        jobId,
        status: "running",
        phase: "starting",
        message: "Worker picked up the job. Connecting to Plex…",
        updatedAt: at,
        steps: [...(progress?.steps ?? []), { at, text: "Worker picked up the job…" }].slice(-20),
      };
      cfg.syncQueued = false;
      cfg.syncClaimedAt = at;
      cfg.syncJobId = jobId;
      cfg.syncProgress = starting;
      await tx.mediaIntegration.update({
        where: { id: row.id },
        data: { config: cfg as Prisma.InputJsonValue },
      });
      const serverId =
        (cfg.syncServerId ? String(cfg.syncServerId) : null) ||
        (cfg.serverId ? String(cfg.serverId) : null);
      return { id: row.id, jobId, serverId };
    },
    { timeout: 15_000 }
  );
}

export async function pumpPlexSyncQueue(): Promise<void> {
  if (pumping) return;
  const claimed = await claimNextPlexSync();
  if (!claimed) return;
  pumping = true;
  const reporter = createSyncReporter(claimed.id, claimed.jobId);
  try {
    const result = await importPlexLibrary(claimed.id, claimed.serverId, reporter);
    if (reporter.snapshot().status === "running") {
      await reporter.done(
        `Sync complete: ${result.imported} new · ${result.skipped} skipped` +
          (result.episodes ? ` · ${result.episodes} episodes` : ""),
        result
      );
    }
  } catch (e) {
    await reporter.fail(e instanceof Error ? e.message : "Plex sync failed");
  } finally {
    pumping = false;
    void pumpPlexSyncQueue().catch((err) => {
      console.error("[plex-sync] queue pump", err instanceof Error ? err.message : err);
    });
  }
}
