"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CountryFlag } from "@/components/ip-with-flag";
import type { CountryWatch } from "@/lib/dashboard-widgets";

export function DashboardMostWatchedByCountry({ widgetsUrl }: { widgetsUrl: string }) {
  const [countries, setCountries] = useState<CountryWatch[]>([]);
  const [loading, setLoading] = useState(true);

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
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Most Watched By Country</h3>
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

      {countries.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
          No live viewers by country yet
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {countries.map((c) => (
            <div
              key={c.countryCode}
              className="shrink-0 w-[180px] rounded-lg border p-3"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
                <CountryFlag code={c.countryCode} className="text-lg" />
                <span className="text-xs font-medium truncate">{c.countryName}</span>
              </div>
              <ul className="space-y-1.5">
                {c.channels.map((ch) => (
                  <li key={ch.name} className="flex justify-between gap-1 text-xs">
                    <span className="truncate" style={{ color: "var(--muted)" }} title={ch.name}>
                      {ch.name}
                    </span>
                    <span className="shrink-0 font-semibold">{ch.count}</span>
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
