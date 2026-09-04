"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PanelUpdateJob } from "@/lib/panel-update-job";

const STORE_KEY = "nexlify-update-job";
/** Compile + swap often exceeds 2 minutes; keep the bar across restarts. */
const KEEP_RUNNING_MS = 45 * 60 * 1000;

type PanelUpdateJobContextValue = {
  job: PanelUpdateJob | null;
  updateRunning: boolean;
  refresh: () => void;
  /** Drop local snapshot (after Clear stuck / successful cancel). */
  clearLocal: () => void;
};

const PanelUpdateJobContext = createContext<PanelUpdateJobContextValue | null>(null);

function readStoredJob(): PanelUpdateJob | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as PanelUpdateJob;
    if (job?.status !== "running" || !job.startedAt) return null;
    const started = Date.parse(job.startedAt);
    if (!Number.isFinite(started) || Date.now() - started > KEEP_RUNNING_MS) {
      sessionStorage.removeItem(STORE_KEY);
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

function writeStoredJob(job: PanelUpdateJob | null) {
  try {
    if (job?.status === "running" && job.startedAt) {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(job));
    } else {
      sessionStorage.removeItem(STORE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function keepRecentRunningJob(prev: PanelUpdateJob | null): PanelUpdateJob | null {
  if (prev?.status !== "running" || !prev.startedAt) return null;
  const started = Date.parse(prev.startedAt);
  if (!Number.isFinite(started) || Date.now() - started > KEEP_RUNNING_MS) return null;
  return prev;
}

function mergeIncomingJob(
  prev: PanelUpdateJob | null,
  next: PanelUpdateJob | null,
  updateRunning: boolean
): PanelUpdateJob | null {
  if (next?.status === "idle" && !next.startedAt) {
    return keepRecentRunningJob(prev);
  }
  if (next?.status === "done") return next;
  if (next?.status === "running") return next;
  if (updateRunning) {
    if (next && next.status === "failed") {
      return {
        ...next,
        status: "running",
        finishedAt: null,
        currentStep: next.currentStep || prev?.currentStep || "Updating…",
        message: next.message,
      };
    }
    return next ?? keepRecentRunningJob(prev) ?? prev;
  }
  if (!next) return keepRecentRunningJob(prev);
  return next;
}

/** One poll loop shared by Updates page + bottom overlay (prevents drift between UIs). */
export function PanelUpdateJobProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<PanelUpdateJob | null>(null);
  const [updateRunning, setUpdateRunning] = useState(false);
  const [, tick] = useState(0);
  const pollInFlight = useRef(false);

  const clearLocal = useCallback(() => {
    writeStoredJob(null);
    setJob(null);
    setUpdateRunning(false);
  }, []);

  const applyJob = useCallback((next: PanelUpdateJob | null, runningFlag: boolean) => {
    setJob((prev) => {
      const merged = mergeIncomingJob(prev, next, runningFlag);
      if (merged?.status === "running") writeStoredJob(merged);
      else if (merged?.status === "done" || merged?.status === "failed") writeStoredJob(null);
      setUpdateRunning(Boolean(runningFlag || merged?.status === "running"));
      return merged;
    });
  }, []);

  const poll = useCallback(() => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);

    fetch(`/api/admin/panel-update/progress?cb=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { job?: PanelUpdateJob | null; updateRunning?: boolean } | null) => {
        if (!d) {
          setJob((prev) => {
            const kept = keepRecentRunningJob(prev) ?? readStoredJob();
            setUpdateRunning(kept != null);
            return kept;
          });
          return;
        }
        applyJob(d.job ?? null, Boolean(d.updateRunning || d.job?.status === "running"));
      })
      .catch(() => {
        setJob((prev) => {
          const kept = keepRecentRunningJob(prev) ?? readStoredJob();
          setUpdateRunning(kept != null);
          return kept;
        });
      })
      .finally(() => {
        window.clearTimeout(timer);
        pollInFlight.current = false;
      });
  }, [applyJob]);

  useLayoutEffect(() => {
    const stored = readStoredJob();
    if (stored) {
      setJob(stored);
      setUpdateRunning(true);
    }
    poll();
  }, [poll]);

  useEffect(() => {
    const ms = updateRunning ? 1000 : 5000;
    const id = window.setInterval(poll, ms);
    return () => window.clearInterval(id);
  }, [poll, updateRunning]);

  useEffect(() => {
    if (!updateRunning) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [updateRunning, job?.startedAt]);

  const value = useMemo(
    () => ({ job, updateRunning, refresh: poll, clearLocal }),
    [job, updateRunning, poll, clearLocal]
  );

  return (
    <PanelUpdateJobContext.Provider value={value}>{children}</PanelUpdateJobContext.Provider>
  );
}

export function usePanelUpdateJobContext(enabled = true): PanelUpdateJobContextValue {
  const ctx = useContext(PanelUpdateJobContext);
  if (!ctx) {
    throw new Error("usePanelUpdateJob must be used within PanelUpdateJobProvider");
  }
  if (!enabled) {
    return { job: null, updateRunning: false, refresh: () => {}, clearLocal: () => {} };
  }
  return ctx;
}
