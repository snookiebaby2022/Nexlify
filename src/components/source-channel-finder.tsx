"use client";

import { useEffect, useState } from "react";
import type { ProviderChannelMatch } from "@/lib/provider-channel-search";

type SourceChannelFinderProps = {
  streamType?: "LIVE" | "MOVIE" | "SERIES";
  label?: string;
  hint?: string;
  onPickProvider: (match: ProviderChannelMatch) => void;
  onPickDirectUrl?: (match: ProviderChannelMatch) => void;
  showDirectUrl?: boolean;
};

export function SourceChannelFinder({
  streamType = "LIVE",
  label = "Search channels on panel",
  hint = "Find the same channel on other providers already imported on this panel — click a result to use its source.",
  onPickProvider,
  onPickDirectUrl,
  showDirectUrl = false,
}: SourceChannelFinderProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProviderChannelMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q, type: streamType });
      fetch(`/api/admin/stream-providers/channel-search?${params}`)
        .then((r) => r.json())
        .then((d) => setMatches(d.matches ?? []))
        .catch(() => setMatches([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query, streamType]);

  return (
    <div
      className="rounded border p-3 space-y-2"
      style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.06)" }}
    >
      <p className="text-xs font-medium">{label}</p>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        {hint}
      </p>
      <input
        type="search"
        placeholder="e.g. BBC One, Sky Sports, ITV2…"
        className="w-full rounded border px-3 py-2 bg-transparent text-sm"
        style={{ borderColor: "var(--border)" }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Searching…
        </p>
      ) : null}
      {!loading && query.trim().length >= 2 && matches.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          No matching channels on configured providers.
        </p>
      ) : null}
      {matches.length > 0 ? (
        <ul
          className="max-h-48 overflow-y-auto rounded border divide-y text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          {matches.map((m) => (
            <li key={m.streamId} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <div className="flex-1 min-w-[10rem]">
                <span className="font-medium">{m.streamName}</span>
                <span className="block text-[10px]" style={{ color: "var(--muted)" }}>
                  {m.providerName}
                  {m.providerPath ? ` · ${m.providerPath}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-[10px] font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => onPickProvider(m)}
              >
                Use provider
              </button>
              {showDirectUrl && onPickDirectUrl && m.streamUrl ? (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-[10px] border"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => onPickDirectUrl(m)}
                >
                  Use URL
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
