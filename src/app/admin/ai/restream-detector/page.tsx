"use client";

import { useEffect, useState } from "react";

type RestreamDetection = {
  id: string;
  lineUsername: string;
  confidencePercent: number;
  riskScore: number;
  indicators: string[];
};

function riskColor(score: number): string {
  if (score >= 7) return "#ef4444";
  if (score >= 4) return "#eab308";
  return "#22c55e";
}

function riskLabel(score: number): string {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function confidenceBarColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 50) return "#eab308";
  return "#22c55e";
}

export default function RestreamDetectorPage() {
  const [detections, setDetections] = useState<RestreamDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai/restream-detector")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load detections");
        }
        return r.json();
      })
      .then((d) => setDetections(d.detections ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Smart Restream Detection</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          AI-powered analysis to detect lines that are likely restreaming or sharing access.
        </p>
      </div>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>}

      {!loading && !error && detections.length === 0 && (
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No restreaming activity detected. All lines look clean.
          </p>
        </div>
      )}

      {detections.length > 0 && (
        <div className="space-y-4">
          {detections.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border p-4 space-y-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{d.lineUsername}</h3>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded capitalize"
                    style={{ color: riskColor(d.riskScore), border: `1px solid ${riskColor(d.riskScore)}` }}
                  >
                    {riskLabel(d.riskScore)} risk
                  </span>
                </div>
                <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Risk Score: <span style={{ color: riskColor(d.riskScore) }}>{d.riskScore}/10</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--muted)" }}>Confidence</span>
                  <span className="font-medium">{d.confidencePercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full" style={{ background: "var(--bg)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(d.confidencePercent, 100)}%`,
                      background: confidenceBarColor(d.confidencePercent),
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Indicators</div>
                <ul className="space-y-1">
                  {d.indicators.map((ind, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span style={{ color: "var(--accent)" }}>&#x2022;</span>
                      {ind}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
