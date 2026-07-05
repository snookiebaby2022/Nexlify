"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, Users, Clock, DollarSign } from "lucide-react";

type AnalyticsData = {
  totalViewers: number;
  peakViewers: number;
  avgWatchTime: number;
  topStreams: { streamId: string; streamName: string; viewers: number }[];
  viewerRetention: number;
  revenue: number;
};

export default function AdvancedAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/advanced-analytics");
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Advanced Analytics</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Users, label: "Total Viewers", value: data.totalViewers, color: "var(--accent)" },
              { icon: TrendingUp, label: "Peak Viewers", value: data.peakViewers, color: "#22c55e" },
              { icon: Clock, label: "Avg Watch Time", value: `${Math.round(data.avgWatchTime / 60)}m`, color: "#eab308" },
              { icon: DollarSign, label: "Revenue", value: `$${data.revenue}`, color: "#a855f7" },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <stat.icon size={20} style={{ color: stat.color }} className="mb-2" />
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <h3 className="text-sm font-semibold mb-3">Top Streams</h3>
            <div className="space-y-2">
              {data.topStreams.map((s, i) => (
                <div key={s.streamId} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>#{i + 1}</span>
                    <span className="text-sm font-medium">{s.streamName || s.streamId}</span>
                  </div>
                  <span className="text-sm tabular-nums">{s.viewers} viewers</span>
                </div>
              ))}
              {!data.topStreams.length && <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>No stream data yet</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
