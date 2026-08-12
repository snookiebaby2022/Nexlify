"use client";

import { useState } from "react";
import { Unlock, Search, Globe } from "lucide-react";

type Result = {
  url: string;
  ok: boolean;
  unlocked?: number;
  total?: number;
  error?: string;
};

export function AdminUnlockIP() {
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [urls, setUrls] = useState("");
  const [usernames, setUsernames] = useState("");
  const [email, setEmail] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  async function unlock(panelUrls: string[], unlockAll: boolean, targetUsernames: string[]) {
    setLoading(true);
    setResults([]);

    try {
      const body: Record<string, unknown> = { panelUrls };
      if (unlockAll) {
        body.unlockAll = true;
      } else if (targetUsernames.length > 0) {
        body.usernames = targetUsernames;
      }
      if (email.trim()) {
        body.email = email;
      }

      const res = await fetch("/api/admin/remote-unlock-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults(panelUrls.map((u) => ({ url: u, ok: false, error: "Request failed" })));
    } finally {
      setLoading(false);
    }
  }

  function getPanelUrls(): string[] {
    return urls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleUnlock() {
    const panelUrls = getPanelUrls();
    if (!panelUrls.length) {
      alert("Enter at least one panel URL");
      return;
    }

    const targetUsernames = usernames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (mode === "all") {
      if (!confirm(`Unlock ALL lines on ${panelUrls.length} panel(s)? This will disable IP restrictions.`)) return;
      unlock(panelUrls, true, []);
    } else {
      if (targetUsernames.length === 0) {
        alert("Enter at least one username");
        return;
      }
      if (!confirm(`Unlock ${targetUsernames.length} line(s) on ${panelUrls.length} panel(s)?`)) return;
      unlock(panelUrls, false, targetUsernames);
    }
  }

  const totalUnlocked = results.reduce((sum, r) => sum + (r.unlocked ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
          <Unlock className="h-5 w-5 text-amber-400" />
          Unlock IP Restrictions
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Remove IP lock restrictions on customer panel lines. This is useful when a customer
          changes their IP or needs to access their panel from a new location.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-300">Panel URLs (one per line)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://panel.example.com\nhttps://another.panel.com"}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none min-h-[100px] font-mono"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                checked={mode === "all"}
                onChange={() => setMode("all")}
                className="text-violet-500"
              />
              <Globe className="h-4 w-4" />
              Unlock ALL lines
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                checked={mode === "specific"}
                onChange={() => setMode("specific")}
                className="text-violet-500"
              />
              <Search className="h-4 w-4" />
              Unlock specific lines
            </label>
          </div>

          {mode === "specific" && (
            <div>
              <label className="block text-sm text-slate-300">Usernames (comma-separated)</label>
              <input
                type="text"
                value={usernames}
                onChange={(e) => setUsernames(e.target.value)}
                placeholder="user1, user2, user3"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <label className="block text-sm text-slate-300 mt-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={handleUnlock}
            disabled={loading || !urls.trim()}
            className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? "Unlocking..." : mode === "all" ? "Unlock ALL Lines" : "Unlock Specific Lines"}
          </button>
        </div>
      </section>

      {results.length > 0 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold text-white">
            Results {totalUnlocked > 0 && <span className="text-amber-400">({totalUnlocked} unlocked)</span>}
          </h3>
          <div className="mt-4 space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 text-sm ${
                  r.ok ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"
                }`}
              >
                <div className="font-mono text-xs text-slate-400 break-all">{r.url}</div>
                <div className={`mt-1 ${r.ok ? "text-green-400" : "text-red-400"}`}>
                  {r.ok
                    ? `Unlocked ${r.unlocked ?? 0} of ${r.total ?? 0} lines${r.email ? ` (email: ${r.email})` : ""}`
                    : `Failed${r.error ? ` — ${r.error}` : ""}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
