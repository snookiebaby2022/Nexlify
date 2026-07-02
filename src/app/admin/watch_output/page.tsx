"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type WatchOutputRow = {
  id: string;
  kind: string;
  source: string;
  streamType: string;
  status: string;
  imported: number;
  skipped: number;
  message: string | null;
  watchFolderName: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export default function WatchOutputPage() {
  const [jobs, setJobs] = useState<WatchOutputRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/watch-output?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setJobs(d.jobs ?? []);
        setLoading(false);
      });
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Watch Folder Output</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Import job history from watch folders and M3U sync. Shows scan results with imported/skipped counts.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search source, status, folder..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button
          type="button"
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Search
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium">Kind</th>
              <th className="p-3 font-medium">Source</th>
              <th className="p-3 font-medium">Folder</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Imported</th>
              <th className="p-3 font-medium">Skipped</th>
              <th className="p-3 font-medium">Duration</th>
              <th className="p-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No import jobs found.
                </td>
              </tr>
            )}
            {!loading &&
              jobs.map((job) => {
                const duration =
                  job.startedAt && job.completedAt
                    ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                    : null;
                return (
                  <tr key={job.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                      {formatDateTime(job.createdAt)}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                        {job.kind}
                      </span>
                    </td>
                    <td className="p-3 text-xs truncate max-w-[200px]" title={job.source}>
                      {job.source}
                    </td>
                    <td className="p-3 text-xs">{job.watchFolderName ?? "—"}</td>
                    <td className="p-3 text-xs">{job.streamType}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                        background: job.status === "completed" ? "rgba(34,197,94,0.15)" : job.status === "error" ? "rgba(239,68,68,0.15)" : job.status === "running" ? "rgba(59,130,246,0.15)" : "rgba(234,179,8,0.15)",
                        color: job.status === "completed" ? "#22c55e" : job.status === "error" ? "#ef4444" : job.status === "running" ? "#3b82f6" : "#eab308",
                      }}>
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums text-center font-medium" style={{ color: "#22c55e" }}>
                      {job.imported}
                    </td>
                    <td className="p-3 tabular-nums text-center" style={{ color: "var(--muted)" }}>
                      {job.skipped}
                    </td>
                    <td className="p-3 tabular-nums text-xs" style={{ color: "var(--muted)" }}>
                      {duration != null ? `${duration}s` : "—"}
                    </td>
                    <td className="p-3 text-xs truncate max-w-[200px]" style={{ color: "var(--muted)" }} title={job.message ?? ""}>
                      {job.message ?? "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
