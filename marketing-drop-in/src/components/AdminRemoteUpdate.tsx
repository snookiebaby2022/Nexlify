"use client";

import { useState } from "react";

type Result = { url: string; ok: boolean; message?: string };

export function AdminRemoteUpdate() {
  const [urls, setUrls] = useState("");
  const [secret, setSecret] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const trigger = async (broadcast = false) => {
    if (!broadcast) {
      const list = urls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!list.length) {
        alert("Enter at least one panel URL");
        return;
      }

      if (!confirm(`Trigger update on ${list.length} panel(s)?`)) return;

      setLoading(true);
      setResults([]);

      try {
        const res = await fetch("/api/admin/remote-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panelUrls: list, secret }),
        });
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults(list.map((u) => ({ url: u, ok: false, message: "Request failed" })));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Broadcast to all panels in the database
    if (!confirm("Trigger update on EVERY panel that has a panelUrl saved? This may take a while.")) return;

    setLoading(true);
    setResults([]);

    try {
      const res = await fetch("/api/admin/remote-update/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([{ url: "broadcast", ok: false, message: "Request failed" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white">Remote Panel Update</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Force a panel update on one or more customer panels. This bypasses their local "Auto-apply" setting.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-300">Panel URLs (one per line)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://panel.example.com\nhttps://another.panel.com"}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none min-h-[120px] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300">Panel API Secret (optional if public)</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="PANEL_API_SECRET"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => trigger(false)}
              disabled={loading}
              className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {loading ? "Triggering..." : "Force Update on These Panels"}
            </button>

            <button
              onClick={() => trigger(true)}
              disabled={loading}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-6 py-2.5 text-sm font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
            >
              {loading ? "Broadcasting..." : "Broadcast to ALL Panels"}
            </button>
          </div>
        </div>
      </section>

      {results.length > 0 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold text-white">Results</h3>
          <div className="mt-4 space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 text-sm ${r.ok ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
                <div className="font-mono text-xs text-slate-400 break-all">{r.url}</div>
                <div className={`mt-1 ${r.ok ? "text-green-400" : "text-red-400"}`}>
                  {r.ok ? "✓ Update triggered" : "✗ Failed"} {r.message ? `— ${r.message}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
