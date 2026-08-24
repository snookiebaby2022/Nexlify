"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { artworkFillPercent, type ArtworkFillProgress, type ArtworkFillType } from "@/lib/artwork-fill-types";

function ageLabel(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 2000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function ArtworkFillPageClient() {
  const [progress, setProgress] = useState<ArtworkFillProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<ArtworkFillType>("ALL");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/streams/artwork-fill");
    const data = await res.json();
    if (res.ok) {
      setProgress(data.progress ?? null);
      setBusy(Boolean(data.busy) || data.progress?.status === "running");
    }
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 1200);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  async function start(mode: "fast" | "full") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/streams/artwork-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Could not start poster fetch");
        return;
      }
      setProgress(data.progress ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await fetch("/api/admin/streams/artwork-fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    void refresh();
  }

  const pct = artworkFillPercent(progress);
  const running = progress?.status === "running" || busy;
  const color =
    progress?.status === "error"
      ? "var(--danger)"
      : progress?.status === "done"
        ? "#22c55e"
        : "var(--accent)";
  const stale =
    progress?.status === "running" && Date.now() - Date.parse(progress.updatedAt) > 90_000;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Posters &amp; icons</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Fill missing movie, TV series, and live channel artwork.{" "}
          <strong>Fast</strong> uses Plex proxy links and IPTV provider catalogs only.{" "}
          <strong>Full</strong> also runs TMDB lookups (requires{" "}
          <Link href="/admin/settings/tmdb" className="underline">
            TMDB API key
          </Link>
          ).
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Content:
          </span>
          {(["ALL", "MOVIE", "SERIES", "LIVE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={running}
              onClick={() => setType(t)}
              className="rounded px-3 py-1.5 text-xs border disabled:opacity-50"
              style={{
                borderColor: type === t ? "var(--accent)" : "var(--border)",
                background: type === t ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
              }}
            >
              {t === "ALL" ? "All" : t === "MOVIE" ? "Movies" : t === "SERIES" ? "TV series" : "Live"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void start("fast")}
            className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {running ? "Running…" : "Fast fetch"}
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void start("full")}
            className="rounded px-4 py-2 text-sm border disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Full fetch (TMDB)
          </button>
          {running ? (
            <button
              type="button"
              onClick={() => void cancel()}
              className="rounded px-4 py-2 text-sm border"
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {progress && progress.status !== "idle" ? (
        <div className="rounded-lg border px-4 py-4 space-y-3 text-sm" style={{ borderColor: color }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize">{progress.mode} mode · {progress.phase}</span>
            <span className="text-xs uppercase tracking-wide" style={{ color }}>
              {progress.status === "running"
                ? "In progress"
                : progress.status === "done"
                  ? "Done"
                  : "Failed"}
            </span>
          </div>

          <p>{progress.message}</p>

          <div className="space-y-1">
            <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
              <span>
                {progress.total > 0
                  ? `${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}`
                  : "Working…"}
              </span>
              <span>{pct}%</span>
            </div>
            <div
              className="h-3 rounded overflow-hidden"
              style={{ background: "var(--border)" }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span>Updated: {progress.updated.toLocaleString()}</span>
            <span>Plex: {progress.fromPlex.toLocaleString()}</span>
            <span>IPTV catalog: {progress.fromProvider.toLocaleString()}</span>
            <span>TMDB: {progress.fromTmdb.toLocaleString()}</span>
            <span>Series covers: {progress.fromSeriesCover.toLocaleString()}</span>
            <span>Live logos: {progress.fromLiveLogo.toLocaleString()}</span>
            <span>Still missing: {progress.remaining.toLocaleString()}</span>
          </div>

          {progress.updatedAt ? (
            <p className="text-xs" style={{ color: stale ? "var(--danger)" : "var(--muted)" }}>
              {progress.status === "running"
                ? stale
                  ? `No update for ${ageLabel(progress.updatedAt)} — job may be stuck; cancel and retry.`
                  : `Last update ${ageLabel(progress.updatedAt)}`
                : `Finished ${ageLabel(progress.updatedAt)}`}
            </p>
          ) : null}

          {progress.steps.length > 0 ? (
            <ol className="text-xs space-y-1 max-h-36 overflow-auto" style={{ color: "var(--muted)" }}>
              {progress.steps.slice(-12).map((step, i) => (
                <li key={`${step.at}-${i}`}>
                  {i === progress.steps.slice(-12).length - 1 && progress.status === "running" ? "→ " : "✓ "}
                  {step.text}
                </li>
              ))}
            </ol>
          ) : null}

          {progress.status === "error" && progress.error ? (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {progress.error}
            </p>
          ) : null}

          {!progress.tmdbConfigured && progress.mode === "full" ? (
            <p className="text-xs text-amber-400">
              TMDB API key not configured — only Plex and IPTV catalog matches will run.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
