"use client";

import { useEffect, useState } from "react";

type Anomaly = {
  id: string;
  type: string;
  severity: string;
  entity: string;
  description: string;
  time: string;
};

const TYPE_LABELS: Record<string, string> = {
  same_ip_spike: "Same-IP Spike",
  geo_impossible: "Geo Impossible",
  bandwidth_spike: "Bandwidth Spike",
  connection_flood: "Connection Flood",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "#3b82f6",
  warning: "#eab308",
  critical: "#ef4444",
};

export default function AnomalyDetectorPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai/anomaly-detector")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load anomalies");
        }
        return r.json();
      })
      .then((d) => setAnomalies(d.anomalies ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Connection Anomaly Detection</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          AI-driven monitoring for suspicious connection patterns and impossible travel.
        </p>
      </div>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Total Anomalies</div>
              <div className="text-3xl font-semibold mt-1">{anomalies.length}</div>
            </div>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Critical</div>
              <div className="text-3xl font-semibold mt-1" style={{ color: "#ef4444" }}>{criticalCount}</div>
            </div>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Warnings</div>
              <div className="text-3xl font-semibold mt-1" style={{ color: "#eab308" }}>{warningCount}</div>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {anomalies.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm" style={{ color: "var(--muted)" }}>No anomalies detected.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
                      <th className="text-left py-3 px-4 text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Type</th>
                      <th className="text-left py-3 px-4 text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Severity</th>
                      <th className="text-left py-3 px-4 text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Entity</th>
                      <th className="text-left py-3 px-4 text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Description</th>
                      <th className="text-left py-3 px-4 text-xs uppercase font-medium" style={{ color: "var(--muted)" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-3 px-4">
                          <span
                            className="text-xs font-medium px-2 py-1 rounded"
                            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                          >
                            {TYPE_LABELS[a.type] ?? a.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ background: SEVERITY_COLORS[a.severity] ?? "var(--muted)" }}
                            />
                            <span
                              className="text-xs font-medium capitalize"
                              style={{ color: SEVERITY_COLORS[a.severity] ?? "var(--muted)" }}
                            >
                              {a.severity}
                            </span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium">{a.entity}</td>
                        <td className="py-3 px-4" style={{ color: "var(--muted)" }}>{a.description}</td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
                          {new Date(a.time).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
