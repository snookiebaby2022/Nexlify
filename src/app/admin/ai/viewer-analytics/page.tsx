"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type PeakHour = { hour: number; viewers: number };
type Country = { country: string; viewers: number };
type Device = { device: string; count: number };
type ChurnRisk = { username: string; daysUntilExpiry: number; activity: string };
type BingePattern = { username: string; peakHour: number; avgSession: string; topContent: string };

export default function ViewerAnalyticsPage() {
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [churnRisks, setChurnRisks] = useState<ChurnRisk[]>([]);
  const [bingePatterns, setBingePatterns] = useState<BingePattern[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/ai/viewer-analytics")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load analytics");
        }
        return r.json();
      })
      .then((d) => {
        setPeakHours(d.peakHours ?? []);
        setCountries(d.countries ?? []);
        setDevices(d.devices ?? []);
        setChurnRisks(d.churnRisks ?? []);
        setBingePatterns(d.bingePatterns ?? []);
        setSummary(d.summary ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxViewers = Math.max(...peakHours.map((h) => h.viewers), 1);
  const maxCountry = Math.max(...countries.map((c) => c.viewers), 1);
  const maxDevice = Math.max(...devices.map((d) => d.count), 1);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Viewer Analytics Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            AI-driven viewer behavior, churn prediction, and content insights.
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
            Refresh
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
          {summary && (
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <h2 className="text-sm font-semibold mb-2">AI Summary</h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{summary}</p>
            </div>
          )}

          <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-medium mb-3">Peak Hours (UTC)</h2>
            <div className="flex items-end gap-1 h-28">
              {peakHours.map((h) => (
                <div
                  key={h.hour}
                  title={`${h.hour}:00 — ${h.viewers} viewers`}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(4, (h.viewers / maxViewers) * 100)}%`,
                    background: "var(--accent)",
                    opacity: 0.4 + (h.viewers / maxViewers) * 0.6,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: "var(--muted)" }}>0:00</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>12:00</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>23:00</span>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-medium mb-3">Top Countries</h2>
              <div className="space-y-2">
                {countries.map((c) => (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="text-sm w-24 truncate">{c.country}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.viewers / maxCountry) * 100}%`, background: "var(--accent)" }}
                      />
                    </div>
                    <span className="text-xs w-10 text-right" style={{ color: "var(--muted)" }}>{c.viewers}</span>
                  </div>
                ))}
                {!countries.length && <p className="text-sm" style={{ color: "var(--muted)" }}>No data.</p>}
              </div>
            </section>

            <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-medium mb-3">Device Distribution</h2>
              <div className="space-y-3">
                {devices.map((d) => (
                  <div key={d.device}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{d.device}</span>
                      <span style={{ color: "var(--muted)" }}>{d.count}</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(d.count / maxDevice) * 100}%`, background: "var(--accent)" }}
                      />
                    </div>
                  </div>
                ))}
                {!devices.length && <p className="text-sm" style={{ color: "var(--muted)" }}>No data.</p>}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-medium mb-3">Churn Risk</h2>
              <div className="space-y-2">
                {churnRisks.map((c) => (
                  <div
                    key={c.username}
                    className="flex items-center justify-between text-sm rounded border px-3 py-2"
                    style={{ borderColor: c.daysUntilExpiry <= 3 ? "#ef4444" : "var(--border)" }}
                  >
                    <span className="font-medium">{c.username}</span>
                    <div className="flex items-center gap-3">
                      <span style={{ color: "var(--muted)" }}>{c.activity}</span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded"
                        style={{
                          background: c.daysUntilExpiry <= 3 ? "#ef444422" : "var(--border)",
                          color: c.daysUntilExpiry <= 3 ? "#ef4444" : "var(--muted)",
                        }}
                      >
                        {c.daysUntilExpiry}d left
                      </span>
                    </div>
                  </div>
                ))}
                {!churnRisks.length && <p className="text-sm" style={{ color: "var(--muted)" }}>No at-risk users.</p>}
              </div>
            </section>

            <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-medium mb-3">Binge Patterns</h2>
              <div className="space-y-2">
                {bingePatterns.map((b) => (
                  <div
                    key={b.username}
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{b.username}</span>
                      <span style={{ color: "var(--muted)" }}>Peak: {b.peakHour}:00</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs" style={{ color: "var(--muted)" }}>
                      <span>Avg session: {b.avgSession}</span>
                      <span>Top: {b.topContent}</span>
                    </div>
                  </div>
                ))}
                {!bingePatterns.length && <p className="text-sm" style={{ color: "var(--muted)" }}>No patterns detected yet.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
