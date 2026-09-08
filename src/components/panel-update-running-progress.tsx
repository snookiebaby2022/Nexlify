"use client";

import type { PanelUpdateJob } from "@/lib/panel-update-job";
import { STEP_DURATION_HINTS, formatUpdateElapsed } from "@/lib/panel-update-ui";

/** Shared running-state progress UI — same data + layout on Updates page and bottom overlay. */
export function PanelUpdateRunningProgress({
  job,
  variant = "overlay",
}: {
  job: PanelUpdateJob;
  variant?: "overlay" | "card";
}) {
  const elapsed = formatUpdateElapsed(job.startedAt);
  const stepHint = job.currentStep ? STEP_DURATION_HINTS[job.currentStep] : null;
  const doneSteps = job.steps.filter((s) => s.status === "done");
  const progress = Math.min(100, job.progress);
  const applying =
    job.currentStep === "apply update" ||
    job.currentStep === "pm2 restart nexlify" ||
    job.currentStep === "pm2 restart all";
  const compiling = job.currentStep === "npm run build" || job.currentStep === "prepare build";
  const waitHint = applying
    ? "The new build is on disk. The panel is restarting now (~15–90s). This is the last step — not a compile freeze."
    : compiling
      ? "Compile can take several minutes with little bar movement — that is webpack, not a freeze. Typical total: 5–15 minutes."
      : "The live panel stays online until the final swap (~15–60s). Typical total: 5–15 minutes.";

  if (variant === "card") {
    return (
      <div
        className="rounded-lg border px-4 py-3 space-y-2"
        style={{ borderColor: "rgba(56, 189, 248, 0.35)", background: "rgba(14, 165, 233, 0.08)" }}
      >
        <div className="flex items-center justify-between text-sm gap-3">
          <span style={{ color: "var(--fg)" }}>{job.currentStep ?? "Updating…"}</span>
          <span className="font-mono text-xs shrink-0" style={{ color: "var(--muted)" }}>
            {elapsed && `${elapsed} · `}
            {progress}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #22c55e, #38bdf8)",
            }}
          />
        </div>
        {job.stepDetail && (
          <p className="text-xs" style={{ color: "#7dd3fc" }}>
            {job.stepDetail}
          </p>
        )}
        {job.currentStep && stepHint && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Typical duration: {stepHint}
          </p>
        )}
        {doneSteps.length > 0 && (
          <ul className="text-xs space-y-1" style={{ color: "var(--muted)" }} aria-label="Completed steps">
            {doneSteps.slice(-4).map((s) => (
              <li key={s.name} className="flex items-center gap-1.5">
                <span style={{ color: "#4ade80" }} aria-hidden>
                  ✓
                </span>
                {s.name}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {waitHint}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel-update-progress-track">
        <div className="panel-update-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="panel-update-progress-step">
        <span className="panel-update-progress-step-main">
          {job.currentStep ?? "Working…"}
          {stepHint && (
            <span className="panel-update-progress-step-hint"> · typical {stepHint}</span>
          )}
        </span>
        <span className="panel-update-progress-pct">{progress}%</span>
      </p>
      {job.stepDetail && <p className="panel-update-progress-detail">{job.stepDetail}</p>}
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
        {applying ? (
          <>
            Apply/restart usually takes <strong>15–90 seconds</strong>. The overlay should close on its
            own when the new panel process comes up. Only use Clear stuck update if there is no change
            for more than 20 minutes or the panel returns 502.
          </>
        ) : compiling ? (
          <>
            Compile often takes <strong>5–15 minutes</strong> with little visible movement around 55–70% —
            that is normal (webpack), not a freeze. Only use Clear stuck update if there is no change
            for more than 20 minutes or the panel returns 502.
          </>
        ) : (
          <>
            The live panel stays up until the final swap/PM2 restart (~15–60s). Only use Clear stuck
            update if there is no change for more than 20 minutes or the panel returns 502.
          </>
        )}
      </p>
    </>
  );
}
