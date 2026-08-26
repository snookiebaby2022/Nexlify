"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_LOG_AUTO_CLEAR_HOURS,
  DEFAULT_LOG_PAGE_SIZE,
  LOG_AUTO_CLEAR_OPTIONS,
  LOG_PAGE_SIZE_OPTIONS,
  parseLogAutoClearHours,
} from "@/lib/log-page";

const selectClass = "rounded-lg border px-3 py-2 text-sm bg-transparent";
const selectStyle = { borderColor: "var(--border)" } as const;

export function LogsPageToolbar({
  pageSize,
  onPageSizeChange,
  onRefresh,
  onClear,
  clearBusy = false,
  clearLabel = "Clear logs",
  showRetention = true,
  children,
}: {
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  onRefresh?: () => void;
  onClear?: () => void | Promise<void>;
  clearBusy?: boolean;
  clearLabel?: string;
  showRetention?: boolean;
  children?: ReactNode;
}) {
  const [hours, setHours] = useState(DEFAULT_LOG_AUTO_CLEAR_HOURS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showRetention) return;
    fetch("/api/admin/logs/retention")
      .then((r) => r.json())
      .then((d) => setHours(parseLogAutoClearHours(d.hours)))
      .catch(() => {});
  }, [showRetention]);

  async function changeRetention(next: number) {
    const parsed = parseLogAutoClearHours(next);
    const prev = hours;
    setHours(parsed);
    setSaving(true);
    try {
      const r = await fetch("/api/admin/logs/retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: parsed }),
      });
      if (!r.ok) setHours(prev);
    } catch {
      setHours(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {children}
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        Show entries
        <select
          className={selectClass}
          style={selectStyle}
          value={pageSize}
          title="Show entries"
          aria-label="Show entries"
          onChange={(e) => onPageSizeChange(Number(e.target.value) || DEFAULT_LOG_PAGE_SIZE)}
        >
          {LOG_PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {showRetention && (
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Auto-clear
          <select
            className={selectClass}
            style={selectStyle}
            value={hours}
            disabled={saving}
            title="Automatically delete log rows older than this interval"
            aria-label="Auto-clear logs"
            onChange={(e) => void changeRetention(Number(e.target.value))}
          >
            {LOG_AUTO_CLEAR_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Refresh
        </button>
      )}
      {onClear && (
        <button
          type="button"
          disabled={clearBusy}
          onClick={() => void onClear()}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer border"
          style={{ borderColor: "var(--border)" }}
        >
          {clearBusy ? "Clearing…" : clearLabel}
        </button>
      )}
    </div>
  );
}
