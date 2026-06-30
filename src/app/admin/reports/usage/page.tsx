"use client";

import { useEffect, useState } from "react";

export default function UsageReportsPage() {
  const [data, setData] = useState<{
    summary: { totalLines: number; activeConnections: number; expiredLines: number };
    topChannels: { name: string; watchCount: number }[];
    lines: { username: string; status: string; watches: number }[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/usage-reports")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load usage reports");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading usage reports…</p>;
  }
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Usage reports</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Line activity, connections, and top watched channels (30 days).
          </p>
        </div>
        <p className="text-sm text-red-500 rounded-lg border border-red-500/30 p-4" style={{ background: "rgba(220, 38, 38, 0.15)" }}>
          Error: {error}
        </p>
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>No usage data available.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage reports</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Line activity, connections, and top watched channels (30 days).
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "Total lines", value: data.summary.totalLines },
          { label: "Live connections", value: data.summary.activeConnections },
          { label: "Expired lines", value: data.summary.expiredLines },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>
              {s.label}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold mb-3">Top channels</h2>
        <ul className="space-y-1 text-sm">
          {data.topChannels.map((c) => (
            <li key={c.name} className="flex justify-between">
              <span>{c.name}</span>
              <span style={{ color: "var(--muted)" }}>{c.watchCount} watches</span>
            </li>
          ))}
          {!data.topChannels.length && (
            <li style={{ color: "var(--muted)" }}>No watch data yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
