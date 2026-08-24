"use client";

import { useEffect, useState } from "react";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

function ageLabel(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 2000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function IntegrationProgressCard({
  progress,
  title,
}: {
  progress: IntegrationSyncProgress | null | undefined;
  title?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (progress?.status !== "running") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [progress?.status, progress?.updatedAt]);

  if (!progress) return null;

  const titleTotal = progress.titleTotal ?? 0;
  const titleCurrent = progress.titleCurrent ?? 0;
  const titlePct =
    titleTotal > 0 ? Math.min(100, Math.round((titleCurrent / titleTotal) * 100)) : null;
  const libPct =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : null;
  const pct =
    titlePct ??
    libPct ??
    (progress.status === "done" ? 100 : progress.status === "error" ? 0 : 12);
  const color =
    progress.status === "error" ? "var(--danger)" : progress.status === "done" ? "#22c55e" : "var(--accent)";
  const age = ageLabel(progress.updatedAt);
  const staleWarning =
    progress.status === "running" && Date.now() - Date.parse(progress.updatedAt) > 90_000;

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2 text-sm" style={{ borderColor: color }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title ?? "Progress"}</span>
        <span className="text-xs uppercase tracking-wide" style={{ color }}>
          {progress.status === "running" ? "In progress" : progress.status === "done" ? "Done" : "Failed"}
        </span>
      </div>
      <p style={{ color: progress.status === "error" ? "var(--danger)" : "var(--text)" }}>
        {progress.message}
      </p>
      {progress.libraryName && progress.status === "running" ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Library: {progress.libraryName}
          {progress.total > 0 ? ` · ${progress.current}/${progress.total}` : ""}
        </p>
      ) : null}
      <div className="h-2 rounded overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {(progress.imported > 0 ||
        progress.skipped > 0 ||
        (progress.episodes ?? 0) > 0 ||
        titleTotal > 0) && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {progress.imported.toLocaleString()} new · {progress.skipped.toLocaleString()} skipped
          {(progress.episodes ?? 0) > 0 ? ` · ${progress.episodes!.toLocaleString()} episodes` : ""}
          {titleTotal > 0
            ? ` · ${titleCurrent.toLocaleString()}/${titleTotal.toLocaleString()} titles`
            : progress.total > 0
              ? ` · library ${progress.current}/${progress.total}`
              : ""}
        </p>
      )}
      {age ? (
        <p className="text-xs" style={{ color: staleWarning ? "var(--danger)" : "var(--muted)" }}>
          {progress.status === "running"
            ? staleWarning
              ? `No update for ${age}. If this stays stuck it will be marked failed — then click Sync again.`
              : `Last update ${age}`
            : `Finished ${age}`}
        </p>
      ) : null}
      {progress.steps.length > 0 && (
        <ol className="text-xs space-y-1 max-h-40 overflow-auto" style={{ color: "var(--muted)" }}>
          {progress.steps.slice(-10).map((step, i) => (
            <li key={`${step.at}-${i}`}>
              {progress.status === "running" && i === Math.min(progress.steps.length, 10) - 1 ? "→ " : "✓ "}
              {step.text}
            </li>
          ))}
        </ol>
      )}
      {progress.warnings?.length ? (
        <ul className="text-xs text-amber-400 space-y-0.5">
          {progress.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
