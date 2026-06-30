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
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Database,
  Server,
  ListChecks,
  Wifi,
  Play,
  Pause,
  ArrowRight,
  Globe,
  KeyRound,
  Layers,
  FileText,
  Settings,
} from "lucide-react";

interface MigrationJob {
  id: string;
  source: "XTREAM_UI" | "XUI" | "NXT" | "WHMCS";
  sourceUrl: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  stats: {
    linesMigrated: number;
    streamsMigrated: number;
    categoriesMigrated: number;
    bouquetsMigrated: number;
    vodMigrated: number;
    seriesMigrated: number;
    errors: number;
    warnings: number;
  };
  createdAt: string;
  completedAt?: string;
  progress?: number;
  selectedItems: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  XTREAM_UI: "Xtream UI",
  XUI: "XUI",
  NXT: "NXT",
  WHMCS: "WHMCS",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  XTREAM_UI: <Server className="w-4 h-4" />,
  XUI: <Database className="w-4 h-4" />,
  NXT: <Wifi className="w-4 h-4" />,
  WHMCS: <Globe className="w-4 h-4" />,
};

const ITEM_OPTIONS = [
  { key: "lines", label: "Lines" },
  { key: "streams", label: "Streams" },
  { key: "categories", label: "Categories" },
  { key: "bouquets", label: "Bouquets" },
  { key: "vod", label: "VOD" },
  { key: "series", label: "Series" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  PENDING: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", icon: <Clock className="w-3.5 h-3.5" /> },
  RUNNING: { bg: "rgba(34,211,238,0.15)", color: "var(--accent)", icon: <Play className="w-3.5 h-3.5" /> },
  COMPLETED: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FAILED: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: <XCircle className="w-3.5 h-3.5" /> },
  CANCELLED: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", icon: <Pause className="w-3.5 h-3.5" /> },
};

export default function MigrationPage() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [wizard, setWizard] = useState({
    source: "XTREAM_UI" as MigrationJob["source"],
    sourceUrl: "",
    apiKey: "",
    selectedItems: ["lines", "streams", "categories", "bouquets", "vod", "series"] as string[],
  });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/migration-jobs")
      .then((r) => r.json())
      .then((d) => {
        setJobs(d.jobs ?? []);
      })
      .catch(() => setError("Failed to load migration jobs."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll running migrations
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
      SOURCE_LABELS[j.source].toLowerCase().includes(q) ||
      j.sourceUrl.toLowerCase().includes(q) ||
      j.status.toLowerCase().includes(q)
    );
  });

  async function createMigration(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/migration-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: wizard.source,
          sourceUrl: wizard.sourceUrl,
          apiKey: wizard.apiKey,
          items: wizard.selectedItems,
        }),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg("Migration started successfully.");
        setShowWizard(false);
        setWizard({
          source: "XTREAM_UI",
          sourceUrl: "",
          apiKey: "",
          selectedItems: ["lines", "streams", "categories", "bouquets", "vod", "series"],
        });
        load();
      } else {
        setActionMsg(j.error || "Migration start failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  function toggleItem(item: string) {
    setWizard((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.includes(item)
        ? prev.selectedItems.filter((i) => i !== item)
        : [...prev.selectedItems, item],
    }));
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Migration Tools</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Migrate from Xtream UI, XUI, NXT, and WHMCS. View running progress and final results.
          </p>
        </div>
        <button
          onClick={() => setShowWizard((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#0f172a" }}
        >
          <Plus className="w-4 h-4" />
          New Migration
        </button>
      </div>

      {showWizard && (
        <div
          className="rounded-lg border p-5 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <h3 className="text-sm font-semibold">Create New Migration</h3>
          <form onSubmit={createMigration} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Source Panel</span>
                <select
                  required
                  className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  value={wizard.source}
                  onChange={(e) => setWizard({ ...wizard, source: e.target.value as MigrationJob["source"] })}
                >
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Source URL</span>
                <input
                  required
                  type="url"
                  className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="https://old-panel.example.com/api"
                  value={wizard.sourceUrl}
                  onChange={(e) => setWizard({ ...wizard, sourceUrl: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>API Key</span>
              <input
                required
                type="password"
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="API key or auth token from source panel"
                value={wizard.apiKey}
                onChange={(e) => setWizard({ ...wizard, apiKey: e.target.value })}
              />
            </label>
            <div>
              <span className="text-sm block mb-2" style={{ color: "var(--muted)" }}>Items to Migrate</span>
              <div className="flex flex-wrap gap-2">
                {ITEM_OPTIONS.map((item) => {
                  const selected = wizard.selectedItems.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleItem(item.key)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border"
                      style={{
                        borderColor: selected ? "var(--accent)" : "var(--border)",
                        background: selected ? "rgba(34,211,238,0.15)" : "var(--bg)",
                        color: selected ? "var(--accent)" : "var(--muted)",
                      }}
                    >
                      {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border" style={{ borderColor: "var(--border)" }} />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={processing || wizard.selectedItems.length === 0}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0f172a" }}
              >
                {processing ? "Starting..." : "Start Migration"}
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
            placeholder="Search migrations..."
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
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading migrations...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Source</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Status</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Items</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Stats</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Created</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Completed</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No migrations found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((j) => {
                    const ss = STATUS_STYLES[j.status];
                    const isExpanded = expandedId === j.id;
                    const totalMigrated =
                      j.stats.linesMigrated +
                      j.stats.streamsMigrated +
                      j.stats.categoriesMigrated +
                      j.stats.bouquetsMigrated +
                      j.stats.vodMigrated +
                      j.stats.seriesMigrated;
                    return (
                      <>
                        <tr key={j.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                              <span style={{ color: "var(--muted)" }}>{SOURCE_ICONS[j.source]}</span>
                              {SOURCE_LABELS[j.source]}
                            </span>
                            <div className="text-xs mt-0.5 font-mono" style={{ color: "var(--muted)" }}>{j.sourceUrl}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ background: ss.bg, color: ss.color }}
                            >
                              {ss.icon}
                              {j.status}
                            </span>
                            {j.status === "RUNNING" && j.progress !== undefined && (
                              <div className="mt-1.5 w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${j.progress}%`, background: "var(--accent)" }}
                                />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {j.selectedItems.map((item) => (
                                <span
                                  key={item}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                                  style={{ background: "rgba(255,255,255,0.04)", color: "var(--muted)", border: "1px solid var(--border)" }}
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span style={{ color: "#22c55e" }}>Migrated: {totalMigrated}</span>
                              <span style={{ color: j.stats.errors > 0 ? "#ef4444" : "var(--muted)" }}>Errors: {j.stats.errors}</span>
                              <span style={{ color: j.stats.warnings > 0 ? "#fbbf24" : "var(--muted)" }}>Warnings: {j.stats.warnings}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{j.createdAt}</td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{j.completedAt || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : j.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs border transition-colors hover:opacity-80"
                              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                              title="View Details"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              Details
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-4 py-4">
                              <div
                                className="rounded-lg border p-4 space-y-3"
                                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                              >
                                <h4 className="text-sm font-semibold">Migration Results</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                  {[
                                    { label: "Lines", value: j.stats.linesMigrated, color: "var(--accent)" },
                                    { label: "Streams", value: j.stats.streamsMigrated, color: "#22c55e" },
                                    { label: "Categories", value: j.stats.categoriesMigrated, color: "#6366f1" },
                                    { label: "Bouquets", value: j.stats.bouquetsMigrated, color: "#f472b6" },
                                    { label: "VOD", value: j.stats.vodMigrated, color: "#fbbf24" },
                                    { label: "Series", value: j.stats.seriesMigrated, color: "#a78bfa" },
                                  ].map((stat) => (
                                    <div
                                      key={stat.label}
                                      className="rounded border p-3 text-center"
                                      style={{ borderColor: "var(--border)" }}
                                    >
                                      <div className="text-xs" style={{ color: "var(--muted)" }}>{stat.label}</div>
                                      <div className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
                                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#ef4444" }}>
                                      Errors ({j.stats.errors})
                                    </div>
                                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                                      {j.stats.errors > 0 ? "Review logs for detailed error messages." : "No errors."}
                                    </div>
                                  </div>
                                  <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
                                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#fbbf24" }}>
                                      Warnings ({j.stats.warnings})
                                    </div>
                                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                                      {j.stats.warnings > 0 ? "Some items required fallback defaults." : "No warnings."}
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
