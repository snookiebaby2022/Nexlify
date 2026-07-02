"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type EPGSuggestion = {
  channelName: string;
  suggestedCategory: string;
  suggestedName: string;
  confidence: number;
};

export default function EPGScraperPage() {
  const [suggestions, setSuggestions] = useState<EPGSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/ai/epg-scraper")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load EPG suggestions");
        }
        return r.json();
      })
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI EPG Scraper</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Auto-detect categories and suggest improvements for your EPG sources.
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
            Rescan
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border p-4 flex flex-col gap-3"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div>
                <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Channel</div>
                <div className="font-semibold">{s.channelName}</div>
              </div>
              <div>
                <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Suggested Name</div>
                <div className="text-sm">{s.suggestedName}</div>
              </div>
              <div>
                <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Category</div>
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ background: "var(--accent)", color: "white" }}>
                  {s.suggestedCategory}
                </span>
              </div>
              <div>
                <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Confidence</div>
                <div className="h-2 rounded-full" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${s.confidence}%`,
                      background: s.confidence >= 80 ? "#22c55e" : s.confidence >= 50 ? "#eab308" : "#ef4444",
                    }}
                  />
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.confidence}%</div>
              </div>
              <button
                type="button"
                className="mt-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white" }}
                onClick={() => alert("Apply functionality coming soon!")}
              >
                Apply
              </button>
            </div>
          ))}
          {!suggestions.length && (
            <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>
              No suggestions found. Add EPG sources first.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
