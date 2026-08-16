"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PanelUpdateJob } from "@/lib/panel-update-job";

type PanelUpdateJobContextValue = {
  job: PanelUpdateJob | null;
  updateRunning: boolean;
  refresh: () => void;
  /** Drop local snapshot (after Clear stuck / successful cancel). */
  clearLocal: () => void;
};

const PanelUpdateJobContext = createContext<PanelUpdateJobContextValue | null>(null);

/** One poll loop shared by Updates page + bottom overlay (prevents drift between UIs). */
export function PanelUpdateJobProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<PanelUpdateJob | null>(null);
  const [updateRunning, setUpdateRunning] = useState(false);
  const [, tick] = useState(0);
  const pollInFlight = useRef(false);

  const clearLocal = useCallback(() => {
    setJob(null);
    setUpdateRunning(false);
  }, []);

  const poll = useCallback(() => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);

    fetch(`/api/admin/panel-update?light=1&cb=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { job?: PanelUpdateJob | null; updateRunning?: boolean } | null) => {
        if (!d) {
          // Keep in-flight running job across 502s during PM2/nginx swap
          setJob((prev) => (prev?.status === "running" ? prev : null));
          setUpdateRunning((prev) => prev || false);
          return;
        }
        const next = d.job ?? null;
        // Idle placeholders are not real jobs
        if (next?.status === "idle" && !next.startedAt) {
          setJob(null);
          setUpdateRunning(false);
          return;
        }
        setJob(next);
        setUpdateRunning(Boolean(d.updateRunning || next?.status === "running"));
      })
      .catch(() => {
        setJob((prev) => (prev?.status === "running" ? prev : null));
      })
      .finally(() => {
        window.clearTimeout(timer);
        pollInFlight.current = false;
      });
  }, []);

  useEffect(() => {
    poll();
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
