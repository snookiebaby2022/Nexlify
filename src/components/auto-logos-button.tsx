"use client";

import { useState } from "react";

export function AutoLogosButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(type: "ALL" | "LIVE" | "MOVIE" | "SERIES" = "ALL") {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/auto-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, limit: 400 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Failed");
        return;
      }
      const tmdbNote =
        data.tmdbConfigured === false
          ? " (set TMDB API key under Settings → TMDB for movie/series posters)"
          : "";
      setMsg(
        `Updated ${data.updated ?? 0} of ${data.scanned ?? 0} items missing icons${tmdbNote}`
      );
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
          {busy ? "Fetching icons…" : "Auto-add icons (live + movies + series)"}
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
