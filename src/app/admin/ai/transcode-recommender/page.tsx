"use client";

import { useEffect, useState } from "react";

type TranscodeRecommendation = {
  streamId: string;
  streamName: string;
  reason: string;
  currentBitrate: number;
  suggestedBitrate: number;
  estimatedSavingsPercent: number;
  viewerImpact: string;
};

export default function TranscodeRecommenderPage() {
  const [recommendations, setRecommendations] = useState<TranscodeRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai/transcode-recommender")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load recommendations");
        }
        return r.json();
      })
      .then((d) => setRecommendations(d.recommendations ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function savingsColor(pct: number): string {
    if (pct >= 40) return "#22c55e";
    if (pct >= 20) return "#eab308";
    return "var(--muted)";
  }

  function savingsBg(pct: number): string {
    if (pct >= 40) return "rgba(34, 197, 94, 0.1)";
    if (pct >= 20) return "rgba(234, 179, 8, 0.1)";
    return "transparent";
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Auto-Transcode Recommendations</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          AI-powered suggestions for streams that would benefit from transcoding optimization.
        </p>
      </div>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>}

      {!loading && !error && recommendations.length === 0 && (
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No transcoding recommendations at this time. All streams are optimized.
          </p>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((rec) => (
            <div
              key={rec.streamId}
              className="rounded-lg border p-4 space-y-3"
              style={{
                borderColor: "var(--border)",
                background: savingsBg(rec.estimatedSavingsPercent),
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-tight">{rec.streamName}</h3>
                <span
                  className="text-xs font-bold shrink-0 px-2 py-0.5 rounded"
                  style={{ color: savingsColor(rec.estimatedSavingsPercent), border: `1px solid ${savingsColor(rec.estimatedSavingsPercent)}` }}
                >
                  {rec.estimatedSavingsPercent}% saved
                </span>
              </div>

              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {rec.reason}
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="uppercase" style={{ color: "var(--muted)" }}>Current</div>
                  <div className="font-medium">{rec.currentBitrate} kbps</div>
                </div>
                <div>
                  <div className="uppercase" style={{ color: "var(--muted)" }}>Suggested</div>
                  <div className="font-medium">{rec.suggestedBitrate} kbps</div>
                </div>
              </div>

              <div className="text-xs" style={{ color: "var(--muted)" }}>
                <span className="uppercase">Viewer impact: </span>
                <span style={{ color: "var(--accent)" }}>{rec.viewerImpact}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
