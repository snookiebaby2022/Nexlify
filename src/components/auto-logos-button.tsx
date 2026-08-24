"use client";

import { useState } from "react";

export function AutoLogosButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(type: "ALL" | "LIVE" | "MOVIE" | "SERIES" = "ALL") {
    setBusy(true);
    setMsg("");
    try {
      let totalUpdated = 0;
      let lastRemaining = 0;
      for (let i = 0; i < 25; i++) {
        const res = await fetch("/api/admin/streams/auto-logos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, tmdbLimit: 250 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg(data.error ?? "Failed");
          return;
        }
        totalUpdated += Number(data.updated ?? 0);
        lastRemaining = Number(data.remaining ?? 0);
        const tmdbNote =
          data.tmdbConfigured === false
            ? " Set a TMDB API key under Settings → TMDB for leftovers without an IPTV poster."
            : "";
        setMsg(
          `Updated ${totalUpdated} (IPTV ${data.fromProvider ?? 0}, TMDB ${data.fromTmdb ?? 0}). ${lastRemaining} still missing.${tmdbNote}`
        );
        if (lastRemaining <= 0) break;
        if (!data.fromTmdb && !data.fromProvider && !data.fromLiveLogo && !data.fromSeriesCover) break;
        if (data.tmdbConfigured === false && !(data.fromProvider > 0) && !(data.fromSeriesCover > 0)) break;
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("ALL")}
          className="rounded px-4 py-2 cursor-pointer border disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          {busy ? "Fetching posters…" : "Fill missing posters (IPTV + TMDB)"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("LIVE")}
          className="rounded px-3 py-2 cursor-pointer border disabled:opacity-50 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          Live only
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("MOVIE")}
          className="rounded px-3 py-2 cursor-pointer border disabled:opacity-50 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          Movies
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("SERIES")}
          className="rounded px-3 py-2 cursor-pointer border disabled:opacity-50 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          Series
        </button>
      </div>
      {msg && <p style={{ color: "var(--muted)" }}>{msg}</p>}
    </div>
  );
}
