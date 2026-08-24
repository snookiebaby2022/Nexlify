import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

export type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

export const SYNC_STALE_MS = 120_000;

export type IntegrationSyncReporter = {
  jobId: string;
  step: (phase: string, message: string) => Promise<void>;
  note: (
    message: string,
    patch?: Partial<
      Pick<
        IntegrationSyncProgress,
        | "current"
        | "total"
        | "imported"
        | "skipped"
        | "episodes"
        | "titleCurrent"
        | "titleTotal"
        | "libraryName"
        | "warnings"
      >
    >
  ) => Promise<void>;
  counts: (
    patch: Partial<
      Pick<
        IntegrationSyncProgress,
        | "current"
        | "total"
        | "imported"
        | "skipped"
        | "episodes"
        | "titleCurrent"
        | "titleTotal"
        | "libraryName"
        | "warnings"
      >
    >
  ) => Promise<void>;
  done: (message: string, extra?: Partial<IntegrationSyncProgress>) => Promise<void>;
  fail: (error: string) => Promise<void>;
  snapshot: () => IntegrationSyncProgress;
};

function asConfig(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

export function readSyncProgress(config: unknown): IntegrationSyncProgress | null {
  const cfg = asConfig(config);
  const raw = cfg.syncProgress;
  if (!raw || typeof raw !== "object") return null;
  return raw as IntegrationSyncProgress;
}

export function isSyncJobActive(progress: IntegrationSyncProgress | null, maxAgeMs = SYNC_STALE_MS): boolean {
  if (!progress || progress.status !== "running") return false;
  const t = Date.parse(progress.updatedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

export function staleSyncFailure(progress: IntegrationSyncProgress): IntegrationSyncProgress {
  const queued = progress.phase === "queued";
  const error = queued
    ? "Plex sync did not start. The scheduled-task worker (nexlify-cron) is not running or is stuck. Start it, then click Sync again."
    : "Plex sync stopped unexpectedly (worker restarted or stalled). Click Sync to continue — titles already imported are skipped.";
  return {
    ...progress,
    status: "error",
    phase: "error",
    message: error,
    error,
    updatedAt: new Date().toISOString(),
  };
}

export async function resolveSyncProgress(
  config: unknown,
  integrationId?: string
): Promise<IntegrationSyncProgress | null> {
  const progress = readSyncProgress(config);
  if (!progress) return null;
  if (progress.status === "running" && !isSyncJobActive(progress)) {
    const expired = staleSyncFailure(progress);
    if (integrationId) {
      const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
      if (row) {
        const cfg = asConfig(row.config);
        cfg.syncQueued = false;
        cfg.syncProgress = expired;
        await prisma.mediaIntegration.update({
          where: { id: integrationId },
          data: { config: cfg as Prisma.InputJsonValue },
        });
      }
    }
    return expired;
  }
  return progress;
}

export function createSyncReporter(integrationId: string, jobId: string): IntegrationSyncReporter {
  const state: IntegrationSyncProgress = {
    jobId,
    status: "running",
    phase: "starting",
    message: "Starting…",
    current: 0,
    total: 0,
    imported: 0,
    skipped: 0,
    episodes: 0,
    titleCurrent: 0,
    titleTotal: 0,
    steps: [],
    updatedAt: new Date().toISOString(),
  };

  let writeChain = Promise.resolve();
  let lastWrite = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stopTimers = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const writeNow = () => {
    lastWrite = Date.now();
    const snapshot = { ...state, steps: [...state.steps] };
    writeChain = writeChain
      .then(async () => {
        const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
        if (!row) return;
        const cfg = asConfig(row.config);
        cfg.syncProgress = snapshot;
        await prisma.mediaIntegration.update({
          where: { id: integrationId },
          data: { config: cfg as Prisma.InputJsonValue },
        });
      })
      .catch((e) => {
        console.error("[integrations] progress persist", e instanceof Error ? e.message : e);
      });
    return writeChain;
  };

  const persist = (force = false) => {
    if (force) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return writeNow();
    }
    const wait = 800 - (Date.now() - lastWrite);
    if (wait <= 0) return writeNow();
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        writeNow();
      }, wait);
    }
    return writeChain;
  };

  heartbeat = setInterval(() => {
    if (state.status !== "running") return;
    state.updatedAt = new Date().toISOString();
    persist(true);
  }, 15_000);

  return {
    jobId,
    async step(phase, message) {
      state.phase = phase;
      state.message = message;
      state.steps.push({ at: new Date().toISOString(), text: message });
      if (state.steps.length > 20) state.steps = state.steps.slice(-20);
      state.updatedAt = new Date().toISOString();
      await persist(true);
    },
    async note(message, patch) {
      if (patch) Object.assign(state, patch);
      state.message = message;
      state.updatedAt = new Date().toISOString();
      await persist(false);
    },
    async counts(patch) {
      Object.assign(state, patch);
      state.updatedAt = new Date().toISOString();
      await persist(false);
    },
    async done(message, extra) {
      stopTimers();
      Object.assign(state, extra);
      state.status = "done";
      state.phase = "done";
      state.message = message;
      state.updatedAt = new Date().toISOString();
      await persist(true);
    },
    async fail(error) {
      stopTimers();
      state.status = "error";
      state.phase = "error";
      state.message = error;
      state.error = error;
      state.updatedAt = new Date().toISOString();
      await persist(true);
    },
    snapshot: () => ({ ...state, steps: [...state.steps] }),
  };
}
