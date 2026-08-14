"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Users, BarChart3 } from "lucide-react";

type UsageForecast = {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  trend: "increasing" | "decreasing" | "stable";
  forecastDate: string;
  historicalData: { date: string; value: number }[];
};

type RetentionSummary = {
  totalActiveViewers: number;
  avgRetentionRate: number;
  topChannels: { streamId: string; name: string; viewers: number }[];
};

export default function RetentionAnalyticsPage() {
  const [summary, setSummary] = useState<RetentionSummary | null>(null);
  const [forecast, setForecast] = useState<UsageForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"connections" | "bandwidth" | "streams">("connections");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, forecastRes] = await Promise.all([
        fetch("/api/admin/retention?action=summary"),
        fetch(`/api/admin/retention?action=forecast&metric=${metric}`),
      ]);
      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setSummary({
          ...d,
          topChannels: Array.isArray(d.topChannels) ? d.topChannels : [],
        });
      }
      if (forecastRes.ok) {
        const d = await forecastRes.json();
        setForecast({
          ...d,
          historicalData: Array.isArray(d.historicalData) ? d.historicalData : [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [metric]);

  useEffect(() => { load(); }, [load]);

  const TrendIcon = forecast?.trend === "increasing" ? TrendingUp : forecast?.trend === "decreasing" ? TrendingDown : Minus;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Retention & Forecasting Analytics</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Viewer retention trends and predictive usage forecasting
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border hover:opacity-80" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-semibold">Active Viewers</span>
            </div>
            <div className="text-3xl font-bold tabular-nums">{summary.totalActiveViewers}</div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-semibold">Avg Retention</span>
            </div>
            <div className="text-3xl font-bold tabular-nums">{Math.round(summary.avgRetentionRate * 100)}%</div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendIcon size={16} style={{ color: forecast?.trend === "increasing" ? "#22c55e" : forecast?.trend === "decreasing" ? "#ef4444" : "var(--muted)" }} />
              <span className="text-sm font-semibold">Forecast</span>
            </div>
            <div className="text-3xl font-bold tabular-nums">{forecast?.predictedValue ?? "—"}</div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {forecast?.confidence ? `${Math.round(forecast.confidence * 100)}% confidence` : "Loading..."}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(["connections", "bandwidth", "streams"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${metric === m ? "text-white" : "border"}`}
            style={metric === m ? { background: "var(--accent)" } : { borderColor: "var(--border)" }}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {forecast && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">30-Day Trend & Forecast</h3>
          <div className="h-48 flex items-end gap-1">
            {forecast.historicalData.map((d, i) => {
              const maxVal = Math.max(...forecast.historicalData.map((h) => h.value), 1);
              const height = (d.value / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max(2, height)}%`,
                      background: i === forecast.historicalData.length - 1 ? "var(--accent)" : "rgba(148,163,184,0.3)",
                    }}
                    title={`${d.date}: ${d.value}`}
                  />
                  {i % 5 === 0 && <span className="text-[9px] rotate-45 origin-left" style={{ color: "var(--muted)" }}>{d.date.slice(5)}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div><span style={{ color: "var(--muted)" }}>Current:</span> <span className="font-semibold">{forecast.currentValue}</span></div>
            <div><span style={{ color: "var(--muted)" }}>Predicted:</span> <span className="font-semibold">{forecast.predictedValue}</span></div>
            <div><span style={{ color: "var(--muted)" }}>Trend:</span> <span className="font-semibold capitalize">{forecast.trend}</span></div>
            <div><span style={{ color: "var(--muted)" }}>Forecast Date:</span> <span className="font-semibold">{forecast.forecastDate}</span></div>
          </div>
        </div>
      )}

      {summary && summary.topChannels.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Top Channels by Viewers</h3>
          <div className="space-y-2">
            {summary.topChannels.map((ch, i) => (
              <div key={ch.streamId} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono w-6 text-center" style={{ color: "var(--muted)" }}>{i + 1}</span>
                  <span className="text-sm font-medium">{ch.name}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{ch.viewers}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
