"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePanelUpdateJob } from "@/hooks/use-panel-update-job";
import { PanelUpdateRunningProgress } from "@/components/panel-update-running-progress";
import { formatUpdateElapsed } from "@/lib/panel-update-ui";

export function PanelUpdateProgress() {
  const { job, updateRunning } = usePanelUpdateJob();
  const [dismissed, setDismissed] = useState(false);

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
            <PanelUpdateRunningProgress job={job} variant="overlay" />
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
