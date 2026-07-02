"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Fingerprint,
  Plus,
  Power,
  Eye,
  RotateCcw,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileKey,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface StreamFingerprint {
  id: string;
  streamName: string;
  lineUsername: string;
  token: string;
  type: "VIDEO" | "AUDIO" | "FRAME" | "INVISIBLE";
  createdAt: string;
  expiresAt: string;
  active: boolean;
  detections: number;
}

interface FingerprintStats {
  totalActive: number;
  totalExpired: number;
  recentDetections: number;
}

const TYPE_LABELS: Record<string, string> = {
  VIDEO: "Video Watermark",
  AUDIO: "Audio Watermark",
  FRAME: "Frame Inject",
  INVISIBLE: "Invisible",
};

export default function StreamFingerprintPage() {
  const [fingerprints, setFingerprints] = useState<StreamFingerprint[]>([]);
  const [stats, setStats] = useState<FingerprintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    streamId: "",
    lineId: "",
    type: "INVISIBLE" as StreamFingerprint["type"],
    ttlHours: 24,
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/admin/stream-fingerprints").then((r) => r.json()),
      fetch("/api/admin/stream-fingerprints/stats").then((r) => r.json()),
    ])
      .then(([data, s]) => {
        setFingerprints(data.fingerprints ?? []);
        setStats(s ?? null);
      })
      .catch(() => setError("Failed to load stream fingerprints."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = fingerprints.filter((f) => {
    const q = search.toLowerCase();
    return (
      !q ||
      f.streamName.toLowerCase().includes(q) ||
      f.lineUsername.toLowerCase().includes(q) ||
      f.token.toLowerCase().includes(q)
    );
  });

  async function deactivate(ids: string[]) {
    if (!ids.length) return;
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/stream-fingerprints/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg(`Deactivated ${ids.length} fingerprint(s).`);
        load();
      } else {
        setActionMsg(j.error || "Deactivation failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/stream-fingerprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generateForm),
      });
      const j = await res.json();
      if (res.ok) {
        setActionMsg("Fingerprint generated successfully.");
        setShowGenerate(false);
        load();
      } else {
        setActionMsg(j.error || "Generation failed.");
      }
    } catch {
      setActionMsg("Network error.");
    } finally {
      setProcessing(false);
    }
  }

  const detail = detailId ? fingerprints.find((f) => f.id === detailId) : null;
  const isExpired = (f: StreamFingerprint) => new Date(f.expiresAt) < new Date();

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stream Fingerprinting</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Invisible watermarking and leak detection tokens for every stream.
          </p>
        </div>
        <button
          onClick={() => setShowGenerate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#0f172a" }}
        >
          <Plus className="w-4 h-4" />
          Generate New
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Total Active",
              value: stats.totalActive,
              icon: <ShieldCheck className="w-5 h-5" />,
              color: "#22c55e",
            },
            {
              label: "Total Expired",
              value: stats.totalExpired,
              icon: <Clock className="w-5 h-5" />,
              color: "#fbbf24",
            },
            {
              label: "Recent Detections",
              value: stats.recentDetections,
              icon: <AlertTriangle className="w-5 h-5" />,
              color: "#ef4444",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border p-4 flex items-center gap-4"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="rounded-full p-2.5" style={{ background: `${s.color}22`, color: s.color }}>
                {s.icon}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  {s.label}
                </div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showGenerate && (
        <div
          className="rounded-lg border p-5 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <h3 className="text-sm font-semibold">Generate New Fingerprint</h3>
          <form onSubmit={generate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Stream ID</span>
              <input
                required
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="Stream identifier..."
                value={generateForm.streamId}
                onChange={(e) => setGenerateForm({ ...generateForm, streamId: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Line ID</span>
              <input
                required
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="Line identifier..."
                value={generateForm.lineId}
                onChange={(e) => setGenerateForm({ ...generateForm, lineId: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Type</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
                value={generateForm.type}
                onChange={(e) => setGenerateForm({ ...generateForm, type: e.target.value as StreamFingerprint["type"] })}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>TTL (hours)</span>
              <input
                type="number"
                min={1}
                required
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={generateForm.ttlHours}
                onChange={(e) => setGenerateForm({ ...generateForm, ttlHours: parseInt(e.target.value, 10) })}
              />
            </label>
            <div className="md:col-span-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={processing}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0f172a" }}
              >
                {processing ? "Generating..." : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
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
            placeholder="Search by stream or line username..."
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
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading fingerprints...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-card)" }}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Stream</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Line</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Token</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Type</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Created</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Expires</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>Active</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No fingerprints found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => {
                    const expired = isExpired(f);
                    return (
                      <tr key={f.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 font-medium">{f.streamName}</td>
                        <td className="px-4 py-3">{f.lineUsername}</td>
                        <td className="px-4 py-3 font-mono text-xs max-w-[10rem] truncate">{f.token}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {TYPE_LABELS[f.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{f.createdAt}</td>
                        <td className="px-4 py-3">
                          <span className={expired ? "text-xs font-semibold" : "text-xs"} style={{ color: expired ? "#ef4444" : "var(--muted)" }}>
                            {expired ? "Expired" : f.expiresAt}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {f.active && !expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              <XCircle className="w-3.5 h-3.5" /> No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {f.active && !expired && (
                              <button
                                disabled={processing}
                                onClick={() => deactivate([f.id])}
                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                                style={{ background: "var(--btn-negative)", color: "#fff" }}
                                title="Deactivate"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setDetailId(detailId === f.id ? null : f.id)}
                              className="inline-flex items-center rounded px-2 py-1 text-xs border transition-colors hover:opacity-80"
                              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                              title="View Token Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="rounded-lg border p-5 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Token Details</h3>
            <button onClick={() => setDetailId(null)} className="text-xs" style={{ color: "var(--muted)" }}>
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>ID</span>
              <span className="font-mono">{detail.id}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Stream</span>
              <span>{detail.streamName}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Line</span>
              <span>{detail.lineUsername}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Type</span>
              <span>{TYPE_LABELS[detail.type]}</span>
            </div>
            <div className="md:col-span-2">
              <span style={{ color: "var(--muted)" }}>Token</span>
              <div className="mt-1 rounded border p-2 font-mono text-xs break-all" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                {detail.token}
              </div>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Created</span>
              <span>{detail.createdAt}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Expires</span>
              <span>{detail.expiresAt}</span>
            </div>
            <div className="flex justify-between md:block">
              <span style={{ color: "var(--muted)" }}>Detections</span>
              <span className="font-semibold">{detail.detections}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
