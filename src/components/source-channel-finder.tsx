"use client";

import { useEffect, useState } from "react";
import type { ProviderChannelMatch } from "@/lib/provider-channel-search";

type ProviderOption = { id: string; name: string };

type SourceChannelFinderProps = {
  streamType?: "LIVE" | "MOVIE" | "SERIES";
  label?: string;
  hint?: string;
  onPickProvider: (match: ProviderChannelMatch) => void;
  onPickDirectUrl?: (match: ProviderChannelMatch) => void;
  showDirectUrl?: boolean;
  initialProviderId?: string;
};

export function SourceChannelFinder({
  streamType = "LIVE",
  label = "Find source URL from another channel",
  hint = "Search BBC, ITV, Sky Sports, TNT Sports, Sky Movies… Pick a provider to search that catalog, or leave on All to search this panel.",
  onPickProvider,
  onPickDirectUrl,
  showDirectUrl = true,
  initialProviderId = "",
}: SourceChannelFinderProps) {
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState(initialProviderId);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [matches, setMatches] = useState<ProviderChannelMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stream-providers")
      .then((r) => r.json())
      .then((d) =>
        setProviders(
          ((d.providers ?? []) as { id: string; name: string; isActive?: boolean }[])
            .filter((p) => p.isActive !== false)
            .map((p) => ({ id: p.id, name: p.name }))
        )
      )
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      setError("");
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ q, type: streamType });
      if (providerId) {
        params.set("providerId", providerId);
        params.set("remote", "1");
      }
      fetch(`/api/admin/stream-providers/channel-search?${params}`, { signal: ac.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error("Search failed");
          return r.json();
        })
        .then((d) => setMatches(d.matches ?? []))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setMatches([]);
          setError("Search failed — try again");
        })
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, streamType, providerId]);

  return (
    <div
      className="rounded border p-3 space-y-2"
      style={{ borderColor: "var(--border)", background: "rgba(148,163,184,0.06)" }}
    >
      <p className="text-xs font-medium">{label}</p>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        {hint}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          className="w-full rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">All panel streams</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="e.g. BBC One, BBC Two, ITV, Sky Sports, TNT Sports…"
          className="w-full rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Searching…
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      {!loading && query.trim().length >= 2 && matches.length === 0 && !error ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          No matches. Try another name, or pick a provider with Xtream login to search its live/VOD list.
        </p>
      ) : null}
      {matches.length > 0 ? (
        <ul
          className="max-h-56 overflow-y-auto rounded border divide-y text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          {matches.map((m) => (
            <li key={m.streamId} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <div className="flex-1 min-w-[10rem]">
                <span className="font-medium">{m.streamName}</span>
                <span className="block text-[10px]" style={{ color: "var(--muted)" }}>
                  {m.providerName}
                  {m.source === "provider" ? " · provider catalog" : ""}
                  {m.providerPath ? ` · ${m.providerPath}` : ""}
                </span>
              </div>
              {m.providerId ? (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-[10px] font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  onClick={() => onPickProvider(m)}
                >
                  Use provider
                </button>
              ) : null}
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
