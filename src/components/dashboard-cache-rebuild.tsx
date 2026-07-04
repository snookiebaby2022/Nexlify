"use client";

import { useState } from "react";
import { Database, RefreshCw } from "lucide-react";

export function DashboardCacheRebuild() {
  const [flushing, setFlushing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; deleted: number; ms: number } | null>(null);

  async function flush() {
    setFlushing(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cache", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ ok: false, deleted: 0, ms: 0 });
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Redis cache</h3>
      <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Flush all cached data (dashboard stats, EPG, categories, playback URLs). Cache will rebuild automatically on next access.
        </p>
        <button
          type="button"
          onClick={flush}
          disabled={flushing}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50 transition"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {flushing ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Flushing…
            </>
          ) : (
            <>
              <Database size={12} />
              Flush cache
            </>
          )}
        </button>
        {result && (
          <p className="text-xs" style={{ color: result.ok ? "var(--success)" : "var(--danger)" }}>
            {result.ok
              ? `${result.deleted} keys cleared in ${result.ms}ms`
              : "Flush failed — check Redis connection"}
          </p>
        )}
      </div>
    </div>
  );
}
