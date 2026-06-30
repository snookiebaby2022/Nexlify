"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Insight = {
  type: string;
  severity: string;
  title: string;
  detail: string;
  metric?: number;
};

export default function AnalyticsInsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [peakHours, setPeakHours] = useState<{ hourUtc: number; estimated: number }[]>([]);
  const [live, setLive] = useState<{ connections: number; openIssues: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/analytics/insights")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json();
          throw new Error(d.error ?? "Not licensed");
        }
        return r.json();
      })
      .then((d) => {
        setInsights(d.insights ?? []);
        setPeakHours(d.peakHours ?? []);
      })
      .catch((e) => setError(e.message));

    const es = new EventSource("/api/admin/monitor/stream");
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.connections != null) setLive({ connections: d.connections, openIssues: d.openIssues ?? 0 });
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics + AI</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Churn prediction, regional rankings, stream optimization — Analytics + AI Pack.
          </p>
        </div>
        <Link href="/admin/marketplace" className="text-sm underline" style={{ color: "var(--accent)" }}>
          Manage packs
        </Link>
      </div>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {live && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Live connections</div>
            <div className="text-3xl font-semibold">{live.connections}</div>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Open stream issues</div>
            <div className="text-3xl font-semibold">{live.openIssues}</div>
          </div>
        </div>
      )}

      <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-medium">AI insights</h2>
        {insights.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No insights yet — enable Analytics + AI Pack.</p>
        ) : (
          <ul className="space-y-2">
            {insights.map((i, idx) => (
              <li key={idx} className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span className="font-medium">{i.title}</span>
                <span className="ml-2 text-xs uppercase" style={{ color: i.severity === "critical" ? "#ef4444" : "var(--muted)" }}>
                  {i.severity}
                </span>
                <p style={{ color: "var(--muted)" }}>{i.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {peakHours.length > 0 && (
        <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-medium mb-3">Peak hours (UTC, estimated)</h2>
          <div className="flex items-end gap-1 h-24">
            {peakHours.map((h) => (
              <div
                key={h.hourUtc}
                title={`${h.hourUtc}:00 UTC — ${h.estimated}%`}
                className="flex-1 rounded-t"
                style={{
                  height: `${Math.max(4, h.estimated)}%`,
                  background: "var(--accent)",
                  opacity: 0.4 + h.estimated / 200,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
