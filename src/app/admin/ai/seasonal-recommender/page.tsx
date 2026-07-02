"use client";

import { useEffect, useState } from "react";

type Recommendation = {
  title: string;
  description: string;
  suggestedStreams: string[];
  estimatedImpact: string;
  timeframe: string;
  season: string;
};

const seasonGradients: Record<string, string> = {
  spring: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
  summer: "linear-gradient(135deg, #fefce8, #fef9c3)",
  autumn: "linear-gradient(135deg, #fff7ed, #fed7aa)",
  fall: "linear-gradient(135deg, #fff7ed, #fed7aa)",
  winter: "linear-gradient(135deg, #eff6ff, #dbeafe)",
  holiday: "linear-gradient(135deg, #fef2f2, #fecaca)",
  default: "linear-gradient(135deg, var(--card), var(--card))",
};

function getSeasonGradient(season: string) {
  const key = season.toLowerCase();
  return seasonGradients[key] ?? seasonGradients.default;
}

export default function SeasonalRecommenderPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    fetch("/api/admin/ai/seasonal-recommender")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setRecommendations(d.recommendations ?? []))
      .catch(() => setError("Failed to load seasonal recommendations"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Seasonal Recommender</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          AI-powered content rotation suggestions based on seasonal trends.
        </p>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading...
        </p>
      )}

      {error && (
        <div
          className="text-sm rounded border p-3"
          style={{ borderColor: "var(--border)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && recommendations.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No recommendations available.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recommendations.map((rec, i) => (
          <div
            key={i}
            className="rounded-lg border p-5 space-y-3"
            style={{
              borderColor: "var(--border)",
              background: getSeasonGradient(rec.season),
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{rec.title}</h2>
              <span
                className="text-xs px-2 py-1 rounded-full font-medium shrink-0"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {rec.season}
              </span>
            </div>

            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {rec.description}
            </p>

            {rec.suggestedStreams.length > 0 && (
              <div>
                <h3
                  className="text-xs font-medium mb-1"
                  style={{ color: "var(--muted)" }}
                >
                  Suggested Streams
                </h3>
                <div className="flex flex-wrap gap-1">
                  {rec.suggestedStreams.map((s, j) => (
                    <span
                      key={j}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-1">
              <div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Impact
                </p>
                <p className="text-sm font-medium">{rec.estimatedImpact}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Timeframe
                </p>
                <p className="text-sm font-medium">{rec.timeframe}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
