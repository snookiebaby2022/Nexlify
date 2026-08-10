"use client";

import { useCallback, useEffect, useState } from "react";
import type { PanelUpdateJob } from "@/lib/panel-update-job";

type LightPayload = {
  job: PanelUpdateJob | null;
  updateRunning?: boolean;
};

/** Single poll source for panel update job — keeps Updates page and bottom overlay in sync. */
export function usePanelUpdateJob(enabled = true) {
  const [job, setJob] = useState<PanelUpdateJob | null>(null);
  const [updateRunning, setUpdateRunning] = useState(false);
  const [, tick] = useState(0);

  const poll = useCallback(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    fetch(`/api/admin/panel-update?light=1&cb=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LightPayload | null) => {
        if (!d) return;
        setJob(d.job ?? null);
        setUpdateRunning(Boolean(d.updateRunning || d.job?.status === "running"));
      })
      .catch(() => {
        /* keep last good job — do not revert to stale page state */
      })
      .finally(() => window.clearTimeout(timer));
  }, [enabled]);

  useEffect(() => {
    poll();
    const ms = updateRunning ? 1500 : 5000;
    const id = setInterval(poll, ms);
    return () => clearInterval(id);
  }, [poll, updateRunning]);

  useEffect(() => {
    if (!updateRunning) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [updateRunning, job?.startedAt]);

  return { job, updateRunning, refresh: poll };
}
