"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { CountryFlag } from "@/components/ip-with-flag";
import type { CountryWatch } from "@/lib/dashboard-widgets";

const MWC_COLLAPSE_KEY = "nx-dash-collapse-mwc";

export function DashboardMostWatchedByCountry({ widgetsUrl }: { widgetsUrl: string }) {
  const [countries, setCountries] = useState<CountryWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(MWC_COLLAPSE_KEY) === "true");
    } catch {}
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(MWC_COLLAPSE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch(widgetsUrl)
      .then((r) => r.json())
      .then((data: { mostWatchedByCountry?: CountryWatch[] }) => {
        setCountries(data.mostWatchedByCountry ?? []);
      })
      .catch(() => setCountries([]))
      .finally(() => setLoading(false));
  }, [widgetsUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, 24 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          Most Watched By Country
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
            last 24 hours
          </span>
        </button>
        <button
          type="button"
          onClick={load}
          className="p-1.5 rounded-md hover:opacity-80 transition-opacity"
          style={{ color: "var(--muted)" }}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {collapsed ? null : countries.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
          No watch history by country yet
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {countries.map((c) => (
            <div
              key={c.countryCode}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
                <CountryFlag code={c.countryCode} className="text-lg" />
                <span className="text-xs font-medium truncate">{c.countryName}</span>
              </div>
              <ul className="space-y-1.5">
                {c.channels.map((ch) => (
                  <li key={ch.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate" style={{ color: "var(--muted)" }} title={ch.name}>
                      {ch.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{ch.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
