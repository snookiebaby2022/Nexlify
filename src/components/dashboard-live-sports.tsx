"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Match = {
  id: number;
  league: string;
  home: string;
  away: string;
  status: string;
  time: string;
  source?: string;
};

export function DashboardLiveSports() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [configured, setConfigured] = useState(true);
  const [providerCount, setProviderCount] = useState(0);

  useEffect(() => {
    fetch("/api/admin/sports/upcoming")
      .then((r) => r.json())
      .then((d) => {
        setMatches(d.matches ?? []);
        setConfigured(d.configured !== false);
        setProviderCount(Number(d.providerCount ?? 0));
      })
      .catch(() => setConfigured(false));
  }, []);

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Live Sports</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Upcoming fixtures from {providerCount > 0 ? `${providerCount} API feed(s)` : "your sports APIs"}
          </p>
        </div>
        <Link href="/admin/settings/general#live-sports" className="text-xs underline" style={{ color: "var(--accent)" }}>
          Configure APIs
        </Link>
      </div>
      {!configured ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Add sports API providers under{" "}
          <Link href="/admin/settings/general#live-sports" className="underline" style={{ color: "var(--accent)" }}>
            Settings → General → Live Sports
          </Link>
          . You can add multiple URLs (football, NBA, UFC, etc.) with the same or different keys.
        </p>
      ) : matches.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No upcoming fixtures in the next 48 hours.
        </p>
      ) : (
        <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {matches.slice(0, 6).map((m) => (
            <li key={`${m.source ?? "x"}-${m.id}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                {m.source && (
                  <span className="text-[10px] uppercase mr-1 px-1 rounded" style={{ background: "rgba(56,189,248,0.12)", color: "var(--muted)" }}>
                    {m.source}
                  </span>
                )}
                <span className="text-xs uppercase mr-2" style={{ color: "var(--muted)" }}>
                  {m.league}
                </span>
                {m.home} vs {m.away}
              </span>
              <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                {m.status} · {m.time}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
