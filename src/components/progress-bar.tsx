"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export type ProgressState = {
  active: boolean;
  current: number;
  total: number;
  label: string;
  errors: string[];
  done: boolean;
};

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>({
    active: false, current: 0, total: 0, label: "", errors: [], done: false,
  });

  function start(total: number, label: string) {
    setProgress({ active: true, current: 0, total, label, errors: [], done: false });
  }

  function update(current: number, label?: string) {
    setProgress((prev) => ({ ...prev, current, label: label ?? prev.label }));
  }

  function error(msg: string) {
    setProgress((prev) => ({ ...prev, errors: [...prev.errors, msg] }));
  }

  function finish() {
    setProgress((prev) => ({ ...prev, active: false, done: true, current: prev.total }));
  }

  function reset() {
    setProgress({ active: false, current: 0, total: 0, label: "", errors: [], done: false });
  }

  return { progress, start, update, error, finish, reset };
}

export function ProgressBar({ progress }: { progress: ProgressState }) {
  if (!progress.active && !progress.done) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const isDone = progress.done;
  const hasErrors = progress.errors.length > 0;

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: isDone && !hasErrors ? "rgba(34,197,94,0.3)" : hasErrors ? "rgba(239,68,68,0.3)" : "var(--border)", background: "var(--card)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDone ? (
            hasErrors ? (
              <AlertCircle size={16} className="text-red-400" />
            ) : (
              <CheckCircle2 size={16} className="text-green-400" />
            )
          ) : (
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
          )}
          <span className="text-sm font-medium">{progress.label}</span>
        </div>
        <span className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
          {progress.current}/{progress.total} ({pct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: isDone
              ? hasErrors
                ? "linear-gradient(90deg, #ef4444, #f87171)"
                : "linear-gradient(90deg, #22c55e, #4ade80)"
              : "linear-gradient(90deg, #3b82f6, #60a5fa)",
          }}
        />
      </div>

      {/* Status text */}
      {!isDone && progress.label && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>{progress.label}…</p>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="max-h-24 overflow-y-auto">
          {progress.errors.slice(0, 5).map((err, i) => (
            <p key={i} className="text-xs text-red-400">{err}</p>
          ))}
          {progress.errors.length > 5 && (
            <p className="text-xs text-red-400">+ {progress.errors.length - 5} more errors</p>
          )}
        </div>
      )}

      {/* Done summary */}
      {isDone && (
        <p className="text-xs" style={{ color: hasErrors ? "#ef4444" : "#22c55e" }}>
          {hasErrors
            ? `Completed with ${progress.errors.length} error(s)`
            : `All ${progress.total} items processed successfully`}
        </p>
      )}
    </div>
  );
}
