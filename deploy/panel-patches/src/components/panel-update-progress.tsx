"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PanelUpdateJob } from "@/lib/panel-update-job";

type JobPayload = { job: PanelUpdateJob | null };

export function PanelUpdateProgress() {
  const [job, setJob] = useState<PanelUpdateJob | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const poll = useCallback(() => {
    fetch("/api/admin/panel-update")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JobPayload | null) => {
        if (d?.job) setJob(d.job);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (job?.status === "running") setDismissed(false);
    if (job?.status === "done") {
      window.dispatchEvent(new Event("nexlify-panel-updated"));
    }
    if (job?.status === "failed") setDismissed(false);
  }, [job?.status]);

  if (!job || dismissed) return null;
  if (job.status === "idle") return null;

  const running = job.status === "running";
  const done = job.status === "done";
  const failed = job.status === "failed";

  return (
    <div
      className="panel-update-progress"
      role="status"
      aria-live="polite"
      aria-busy={running}
    >
      <div className="panel-update-progress-inner">
        <div className="panel-update-progress-header">
          <span className="panel-update-progress-title">
            {running && "Updating panel…"}
            {done && "Update complete"}
            {failed && "Update failed"}
          </span>
          {!running && (
            <button
              type="button"
              className="panel-update-progress-dismiss"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </div>

        {running && (
          <>
            <div className="panel-update-progress-track">
              <div
                className="panel-update-progress-fill"
                style={{ width: `${Math.min(100, job.progress)}%` }}
              />
            </div>
            <p className="panel-update-progress-step">
              {job.currentStep ?? "Working…"}
              <span className="panel-update-progress-pct">{job.progress}%</span>
            </p>
            <p className="panel-update-progress-hint">
              You can keep using the panel. The app will restart when the update finishes.
            </p>
          </>
        )}

        {done && (
          <p className="panel-update-progress-message">
            {job.message ?? `Updated to v${job.toVersion ?? "?"}.`}
            {" "}
            <button
              type="button"
              className="panel-update-progress-reload"
              onClick={() => window.location.reload()}
            >
              Reload now
            </button>
          </p>
        )}

        {failed && (
          <p className="panel-update-progress-message panel-update-progress-message--error">
            {job.message ?? "Something went wrong."}{" "}
            <Link href="/admin/settings/updates" className="panel-update-progress-link">
              View details
            </Link>
            {" "}
            <button
              type="button"
              className="panel-update-progress-reload"
              onClick={() => {
                fetch("/api/admin/panel-update", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "cancel" }),
                }).then(() => setDismissed(true));
              }}
            >
              Dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
