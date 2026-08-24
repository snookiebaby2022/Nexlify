import { randomUUID } from "node:crypto";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import type { ArtworkFillProgress, ArtworkFillReporter } from "@/lib/artwork-fill-types";

export type { ArtworkFillProgress, ArtworkFillMode, ArtworkFillType } from "@/lib/artwork-fill-types";

export const ARTWORK_FILL_STALE_MS = 180_000;

const PROGRESS_KEY = "artworkFillProgress";

export function readArtworkFillProgress(settings?: Record<string, unknown>): ArtworkFillProgress | null {
  const raw = settings?.[PROGRESS_KEY] ?? null;
  if (!raw || typeof raw !== "object") return null;
  return raw as ArtworkFillProgress;
}

export async function loadArtworkFillProgress(): Promise<ArtworkFillProgress | null> {
  const settings = await getSettingGroup("streams");
  const progress = readArtworkFillProgress(settings);
  if (!progress) return null;
  if (progress.status === "running" && !isArtworkFillActive(progress)) {
    return staleArtworkFillFailure(progress);
  }
  return progress;
}

export function isArtworkFillActive(
  progress: ArtworkFillProgress | null,
  maxAgeMs = ARTWORK_FILL_STALE_MS
): boolean {
  if (!progress || progress.status !== "running") return false;
  const t = Date.parse(progress.updatedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

export function staleArtworkFillFailure(progress: ArtworkFillProgress): ArtworkFillProgress {
  const error =
    "Poster fetch stopped unexpectedly (panel restarted or job stalled). Start again — titles already updated are skipped.";
  return {
    ...progress,
    status: "error",
    phase: "error",
    message: error,
    error,
    updatedAt: new Date().toISOString(),
  };
}

async function persistProgress(snapshot: ArtworkFillProgress) {
  const settings = await getSettingGroup("streams");
  await setSettingGroup("streams", { ...settings, [PROGRESS_KEY]: snapshot });
}

export async function requestArtworkFillCancel(): Promise<void> {
  const progress = await loadArtworkFillProgress();
  if (!progress || progress.status !== "running") return;
  await persistProgress({ ...progress, cancelRequested: true, updatedAt: new Date().toISOString() });
}

export function createArtworkFillReporter(
  jobId: string,
  mode: ArtworkFillProgress["mode"],
  types: ArtworkFillProgress["types"]
): ArtworkFillReporter {
  const state: ArtworkFillProgress = {
    jobId,
    status: "running",
    mode,
    types,
    phase: "starting",
    message: "Starting…",
    current: 0,
    total: 0,
    updated: 0,
    fromProvider: 0,
    fromPlex: 0,
    fromSeriesCover: 0,
    fromTmdb: 0,
    fromLiveLogo: 0,
    remaining: 0,
    tmdbConfigured: false,
    steps: [],
    updatedAt: new Date().toISOString(),
    cancelRequested: false,
  };

  let writeChain = Promise.resolve();
  let lastWrite = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cachedSettings: Record<string, unknown> | null = null;

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
        const settings = cachedSettings ?? (await getSettingGroup("streams"));
        cachedSettings = settings;
        await setSettingGroup("streams", { ...settings, [PROGRESS_KEY]: snapshot });
      })
      .catch((e) => {
        console.error("[artwork-fill] progress persist", e instanceof Error ? e.message : e);
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
    const wait = 600 - (Date.now() - lastWrite);
    if (wait <= 0) return writeNow();
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        writeNow();
      }, wait);
    }
    return writeChain;
  };

  const refreshCancelFlag = async () => {
    const settings = await getSettingGroup("streams");
    cachedSettings = settings;
    const live = readArtworkFillProgress(settings);
    if (live?.jobId === jobId && live.cancelRequested) {
      state.cancelRequested = true;
    }
  };

  heartbeat = setInterval(() => {
    if (state.status !== "running") return;
    state.updatedAt = new Date().toISOString();
    void refreshCancelFlag().then(() => persist(true));
  }, 10_000);

  return {
    jobId,
    async step(phase, message) {
      await refreshCancelFlag();
      state.phase = phase;
      state.message = message;
      state.steps.push({ at: new Date().toISOString(), text: message });
      if (state.steps.length > 24) state.steps = state.steps.slice(-24);
      state.updatedAt = new Date().toISOString();
      await persist(true);
    },
    async note(message, patch) {
      await refreshCancelFlag();
      if (patch) Object.assign(state, patch);
      state.message = message;
      state.updatedAt = new Date().toISOString();
      await persist(false);
    },
    async counts(patch) {
      await refreshCancelFlag();
      Object.assign(state, patch);
      state.updatedAt = new Date().toISOString();
      await persist(false);
    },
    async done(message) {
      stopTimers();
      state.status = "done";
      state.phase = "done";
      state.message = message;
      state.current = state.total > 0 ? state.total : state.current;
      state.updatedAt = new Date().toISOString();
      state.cancelRequested = false;
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
    isCancelled: () => state.cancelRequested === true,
    snapshot: () => ({ ...state, steps: [...state.steps] }),
  };
}

export async function startArtworkFillJob(opts: {
  mode: ArtworkFillProgress["mode"];
  types: ArtworkFillProgress["types"];
}): Promise<{ alreadyRunning: boolean; jobId: string; progress: ArtworkFillProgress }> {
  const live = await loadArtworkFillProgress();
  if (live && isArtworkFillActive(live)) {
    return { alreadyRunning: true, jobId: live.jobId, progress: live };
  }

  const jobId = randomUUID();
  const reporter = createArtworkFillReporter(jobId, opts.mode, opts.types);
  await reporter.step("queued", "Queued — starting poster fetch…");
  return { alreadyRunning: false, jobId, progress: reporter.snapshot() };
}
