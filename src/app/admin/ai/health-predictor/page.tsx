"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type StreamHealth = {
  name: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskPercent: number;
  reason: string;
  recommendation: string;
};

const riskColors: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

export default function HealthPredictorPage() {
  const [streams, setStreams] = useState<StreamHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/ai/health-predictor")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load predictions");
        }
        return r.json();
      })
      .then((d) => setStreams(d.streams ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const atRisk = streams.filter((s) => s.riskLevel !== "low").length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Smart Stream Health Predictor</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            AI-powered failure prediction and recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ai" className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ background: "var(--border)", color: "var(--muted)" }}>
            Back
          </Link>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Refresh Predictions
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Total Streams</div>
              <div className="text-3xl font-semibold mt-1">{streams.length}</div>
            </div>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>At Risk</div>
              <div className="text-3xl font-semibold mt-1" style={{ color: atRisk > 0 ? "#f87171" : "#22c55e" }}>
                {atRisk}
              </div>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Stream Name</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Risk Level</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Risk %</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Reason</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {streams.map((s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ background: riskColors[s.riskLevel] + "22", color: riskColors[s.riskLevel] }}
                        >
                          {s.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">{s.riskPercent}%</td>
                      <td className="px-4 py-3 max-w-[200px]" style={{ color: "var(--muted)" }}>{s.reason}</td>
                      <td className="px-4 py-3 max-w-[200px]" style={{ color: "var(--muted)" }}>{s.recommendation}</td>
                    </tr>
                  ))}
                  {!streams.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No streams to analyze.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
