"use client";

import { useEffect, useState } from "react";

type TmdbVodBackfillStatus = {
  running: boolean;
  movies: number;
  series: number;
  missed: number;
  lastMovies: number;
  lastSeries: number;
  lastMissed: number;
  lastBatchAt: string;
  done: boolean;
};

export function TmdbBackfillBanner() {
  const [status, setStatus] = useState<TmdbVodBackfillStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/tmdb-backfill");
        if (!res.ok) return;
        const data = (await res.json()) as TmdbVodBackfillStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status || (!status.lastBatchAt && !status.movies && !status.series && !status.running)) {
    return null;
  }

  const when = status.lastBatchAt ? new Date(status.lastBatchAt).toLocaleString() : "—";
  const label = status.running
    ? "TMDB poster/info fill is running"
    : status.done
      ? "TMDB poster/info fill finished this pass"
      : "TMDB poster/info fill (last batch)";

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      <p className="font-medium">{label}</p>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        Movies updated {status.movies.toLocaleString()} · series episodes {status.series.toLocaleString()} ·
        missed {status.missed.toLocaleString()}
        {status.lastBatchAt ? ` · last batch ${when}` : ""}
        {status.running
          ? ` (this batch: ${status.lastMovies} movies, ${status.lastSeries} series)`
          : ""}
      </p>
    </div>
  );
}
