"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PanelUpdateJob } from "@/lib/panel-update-job";
import { STEP_DURATION_HINTS, formatUpdateElapsed } from "@/lib/panel-update-ui";

type JobPayload = { job: PanelUpdateJob | null };

export function PanelUpdateProgress() {
  const [job, setJob] = useState<PanelUpdateJob | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [, tick] = useState(0);

  const jobKey = job
    ? `${job.status}:${job.finishedAt ?? job.startedAt ?? ""}:${job.message ?? ""}`
    : "";

  const dismissJob = useCallback(
    (clearOnServer = false) => {
      if (jobKey) {
        try {
          sessionStorage.setItem(`nexlify-update-dismiss:${jobKey}`, "1");
        } catch {
          /* ignore */
        }
      }
      setDismissed(true);
      if (clearOnServer) {
        fetch("/api/admin/panel-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }).catch(() => {});
      }
    },
    [jobKey]
  );

  const poll = useCallback(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    fetch("/api/admin/panel-update?light=1", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JobPayload | null) => {
        if (d?.job) setJob(d.job);
        else setJob(null);
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.startedAt]);

  useEffect(() => {
    if (!job) return;
    try {
      if (jobKey && sessionStorage.getItem(`nexlify-update-dismiss:${jobKey}`)) {
        setDismissed(true);
        return;
      }
    } catch {
      /* ignore */
    }
    if (job.status === "running") setDismissed(false);
    if (job.status === "done") {
      window.dispatchEvent(new Event("nexlify-panel-updated"));
      const timer = setTimeout(() => dismissJob(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [job, jobKey, dismissJob]);

  if (!job || dismissed) return null;
  if (job.status === "idle") return null;

  const running = job.status === "running";
  const done = job.status === "done";
  const failed = job.status === "failed";
  const elapsed = formatUpdateElapsed(job.startedAt);
  const stepHint = job.currentStep ? STEP_DURATION_HINTS[job.currentStep] : null;
  const doneSteps = job.steps.filter((s) => s.status === "done");

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
          <div className="panel-update-progress-meta">
            {running && elapsed && (
              <span className="panel-update-progress-elapsed" title="Elapsed time">
                {elapsed}
              </span>
            )}
            {!running && (
              <button
                type="button"
                className="panel-update-progress-dismiss"
                onClick={() => dismissJob(failed)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            )}
          </div>
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
              <span className="panel-update-progress-step-main">
                {job.currentStep ?? "Working…"}
                {stepHint && (
                  <span className="panel-update-progress-step-hint"> · typical {stepHint}</span>
                )}
              </span>
              <span className="panel-update-progress-pct">{job.progress}%</span>
            </p>
            {job.stepDetail && (
              <p className="panel-update-progress-detail">{job.stepDetail}</p>
            )}
            {doneSteps.length > 0 && (
              <ul className="panel-update-progress-steps-done" aria-label="Completed steps">
                {doneSteps.slice(-4).map((s) => (
                  <li key={s.name}>
                    <span className="panel-update-progress-check" aria-hidden>
                      ✓
                    </span>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
            <p className="panel-update-progress-hint">
              The panel stays online during the build. Only the final restart (~10 seconds) briefly interrupts
              access. Full updates usually finish in <strong>3–6 minutes</strong>; the build step is slowest.
            </p>
          </>
        )}

        {done && (
          <p className="panel-update-progress-message">
            {job.message ?? `Updated to v${job.toVersion ?? "?"}.`}
            {elapsed ? ` (${elapsed})` : ""}{" "}
            <button
              type="button"
              className="panel-update-progress-reload"
              onClick={() => {
                dismissJob(true);
                if (job.toVersion) {
                  try {
                    sessionStorage.setItem("nexlify-show-release-notes", job.toVersion);
                  } catch {
                    /* ignore */
                  }
                }
                window.location.reload();
              }}
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
              onClick={() => dismissJob(true)}
            >
              Dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
