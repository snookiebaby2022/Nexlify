"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  RotateCcw,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ListChecks,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  FileText,
  Filter,
  Settings,
  Wand2,
} from "lucide-react";

interface MassEditJob {
  id: string;
  entityType: "LINES" | "STREAMS" | "MOVIES" | "SERIES" | "CATEGORIES" | "BOUQUETS";
  action: "UPDATE" | "ENABLE" | "DISABLE" | "DELETE" | "ASSIGN_BOUQUET" | "CHANGE_PACKAGE";
  totalCount: number;
  successCount: number;
  failedCount: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  progress?: number;
  filterCriteria?: string;
  changes?: string;
}

interface MassEditResult {
  successIds: string[];
  failedIds: { id: string; reason: string }[];
}

const ENTITY_LABELS: Record<string, string> = {
  LINES: "Lines",
  STREAMS: "Streams",
  MOVIES: "Movies",
  SERIES: "Series",
  CATEGORIES: "Categories",
  BOUQUETS: "Bouquets",
};

const ACTION_LABELS: Record<string, string> = {
  UPDATE: "Update Fields",
  ENABLE: "Enable",
  DISABLE: "Disable",
  DELETE: "Delete",
  ASSIGN_BOUQUET: "Assign Bouquet",
  CHANGE_PACKAGE: "Change Package",
};

const STATUS_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  PENDING: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", icon: <Clock className="w-3.5 h-3.5" /> },
  RUNNING: { bg: "rgba(34,211,238,0.15)", color: "var(--accent)", icon: <Play className="w-3.5 h-3.5" /> },
  COMPLETED: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FAILED: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: <XCircle className="w-3.5 h-3.5" /> },
  CANCELLED: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", icon: <Pause className="w-3.5 h-3.5" /> },
};

export default function MassEditPage() {
  const [jobs, setJobs] = useState<MassEditJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, MassEditResult>>({});

  const [wizard, setWizard] = useState({
    entity: "LINES" as MassEditJob["entityType"],
    action: "UPDATE" as MassEditJob["action"],
    filterCriteria: "",
    changes: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/mass-edit-jobs")
      .then((r) => r.json())
      .then((d) => {
        setJobs(d.jobs ?? []);
      })
      .catch(() => setError("Failed to load mass edit jobs."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll running jobs
  useEffect(() => {
    const running = jobs.filter((j) => j.status === "RUNNING");
    if (!running.length) return;
    const t = setInterval(() => {
      load();
    }, 5000);
    return () => clearInterval(t);
  }, [jobs, load]);

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    return (
      !q ||
      j.id.toLowerCase().includes(q) ||
      ENTITY_LABELS[j.entityType].toLowerCase().includes(q) ||
      ACTION_LABELS[j.action].toLowerCase().includes(q) ||
      j.status.toLowerCase().includes(q)
    );
  });

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/mass-edit-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wizard),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg("Mass edit job created successfully.");
        setShowWizard(false);
        setWizard({ entity: "LINES", action: "UPDATE", filterCriteria: "", changes: "" });
        load();
      } else {
        setActionMsg(j.error || "Creation failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  async function loadResults(id: string) {
    if (results[id]) {
      setExpandedId(expandedId === id ? null : id);
      return;
    }
    try {
      const res = await fetch(`/api/admin/mass-edit-jobs/${id}/results`);
      const j = await res.json();
      if (res.ok) {
        setResults((prev) => ({ ...prev, [id]: j }));
        setExpandedId(id);
      }
    } catch {
      // silently ignore
    }
  }

  function downloadResults(id: string) {
    const r = results[id];
    if (!r) return;
    const rows = [
      ["Type", "ID", "Reason"],
      ...r.successIds.map((sid) => ["SUCCESS", sid, ""]),
      ...r.failedIds.map((f) => ["FAILED", f.id, f.reason]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mass-edit-results-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mass Edit / Bulk Operations</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Create and monitor bulk jobs. Update, enable, disable, or delete entities across the panel.
          </p>
        </div>
        <button
          onClick={() => setShowWizard((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#0f172a" }}
        >
          <Plus className="w-4 h-4" />
          New Job
        </button>
      </div>

      {showWizard && (
        <div
          className="rounded-lg border p-5 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <h3 className="text-sm font-semibold">Create New Mass Edit Job</h3>
          <form onSubmit={createJob} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Entity Type</span>
                <select
                  required
                  className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  value={wizard.entity}
                  onChange={(e) => setWizard({ ...wizard, entity: e.target.value as MassEditJob["entityType"] })}
                >
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Action</span>
                <select
                  required
                  className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  value={wizard.action}
                  onChange={(e) => setWizard({ ...wizard, action: e.target.value as MassEditJob["action"] })}
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Filter Criteria (JSON or simple query)</span>
              <textarea
                rows={3}
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
                style={{ borderColor: "var(--border)" }}
                placeholder='e.g. {"status": "active", "packageId": "123"}'
                value={wizard.filterCriteria}
                onChange={(e) => setWizard({ ...wizard, filterCriteria: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Changes / Values (JSON)</span>
              <textarea
                rows={3}
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
                style={{ borderColor: "var(--border)" }}
                placeholder='e.g. {"bouquetIds": ["1","2"]}'
                value={wizard.changes}
                onChange={(e) => setWizard({ ...wizard, changes: e.target.value })}
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={processing}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0f172a" }}
              >
                {processing ? "Creating..." : "Start Job"}
              </button>
              <button
                type="button"
                onClick={() => setShowWizard(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {actionMsg && (
        <div
          className="rounded-lg px-4 py-2 text-sm"
          style={{
            background: actionMsg.includes("error") || actionMsg.includes("failed") || actionMsg.includes("Network")
              ? "rgba(239,68,68,0.15)"
              : "rgba(34,197,94,0.15)",
            color: actionMsg.includes("error") || actionMsg.includes("failed") || actionMsg.includes("Network")
              ? "#ef4444"
              : "#22c55e",
          }}
        >
          {actionMsg}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1 max-w-md"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <Search className="w-4 h-4" style={{ color: "var(--muted)" }} />
          <input
            type="text"
            placeholder="Search jobs..."
            className="bg-transparent outline-none text-sm w-full"
            style={{ color: "var(--text)" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--muted)" }}
        >
          <RotateCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading jobs...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Entity</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Action</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Total</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Success</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Failed</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Status</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Created</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No jobs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((j) => {
                    const ss = STATUS_STYLES[j.status];
                    const isExpanded = expandedId === j.id;
                    return (
                      <>
                        <tr key={j.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                              <Layers className="w-4 h-4" style={{ color: "var(--muted)" }} />
                              {ENTITY_LABELS[j.entityType]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs" style={{ color: "var(--muted)" }}>
                              {ACTION_LABELS[j.action]}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">{j.totalCount}</td>
                          <td className="px-4 py-3" style={{ color: "#22c55e" }}>{j.successCount}</td>
                          <td className="px-4 py-3" style={{ color: j.failedCount > 0 ? "#ef4444" : "var(--muted)" }}>{j.failedCount}</td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ background: ss.bg, color: ss.color }}
                            >
                              {ss.icon}
                              {j.status}
                            </span>
                          </td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{j.createdAt}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {j.status === "COMPLETED" && (
                                <button
                                  onClick={() => loadResults(j.id)}
                                  className="inline-flex items-center rounded px-2 py-1 text-xs border transition-colors hover:opacity-80"
                                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                                  title="View Results"
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {j.status === "RUNNING" && j.progress !== undefined && (
                                <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${j.progress}%`, background: "var(--accent)" }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && results[j.id] && (
                          <tr>
                            <td colSpan={8} className="px-4 py-4">
                              <div
                                className="rounded-lg border p-4 space-y-3"
                                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                              >
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold">Results</h4>
                                  <button
                                    onClick={() => downloadResults(j.id)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:opacity-80"
                                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download CSV
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#22c55e" }}>
                                      Success ({results[j.id].successIds.length})
                                    </div>
                                    <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1 font-mono text-xs" style={{ borderColor: "var(--border)" }}>
                                      {results[j.id].successIds.length === 0 ? (
                                        <span style={{ color: "var(--muted)" }}>None</span>
                                      ) : (
                                        results[j.id].successIds.map((sid) => (
                                          <div key={sid} className="flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" style={{ color: "#22c55e" }} />
                                            {sid}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#ef4444" }}>
                                      Failed ({results[j.id].failedIds.length})
                                    </div>
                                    <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1 font-mono text-xs" style={{ borderColor: "var(--border)" }}>
                                      {results[j.id].failedIds.length === 0 ? (
                                        <span style={{ color: "var(--muted)" }}>None</span>
                                      ) : (
                                        results[j.id].failedIds.map((f) => (
                                          <div key={f.id} className="flex items-start gap-1">
                                            <XCircle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
                                            <span>{f.id} — {f.reason}</span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
