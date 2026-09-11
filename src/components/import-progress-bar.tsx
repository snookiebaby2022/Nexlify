"use client";

import { progressPercent, type ImportProgressState } from "@/lib/admin-import-ndjson";

export function ImportProgressBar({ progress }: { progress: ImportProgressState | null }) {
  if (!progress) return null;
  const pct = progressPercent(progress.current, progress.total);
  const indeterminate = progress.total <= 0;

  return (
    <div
      className="rounded-lg border px-4 py-3 space-y-2"
      style={{ borderColor: "var(--accent)", background: "rgba(0,192,239,0.06)" }}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">{progress.message}</p>
      <div
        className="h-2.5 w-full rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full animate-pulse"
            style={{ background: "var(--accent)" }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 text-xs" style={{ color: "var(--muted)" }}>
        {!indeterminate ? (
          <span>
            {progress.current.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
          </span>
        ) : null}
        {progress.imported != null ? <span>Imported: {progress.imported.toLocaleString()}</span> : null}
        {progress.skipped != null ? <span>Skipped: {progress.skipped.toLocaleString()}</span> : null}
      </div>
    </div>
  );
}
