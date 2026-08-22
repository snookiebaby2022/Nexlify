"use client";

import { useEffect, useMemo, useState } from "react";
import { SourceChannelFinder } from "@/components/source-channel-finder";
import type { ProviderChannelMatch } from "@/lib/provider-channel-search";

type Provider = {
  id: string;
  name: string;
  providerType: string | null;
  baseUrl?: string | null;
  isActive: boolean;
};

export function ProviderSourceFields({
  providerId,
  providerPath,
  useProvider,
  onChange,
  vodOnly = true,
  streamType = "LIVE",
}: {
  providerId: string;
  providerPath: string;
  useProvider: boolean;
  onChange: (next: { providerId: string; providerPath: string; useProvider: boolean }) => void;
  vodOnly?: boolean;
  streamType?: "LIVE" | "MOVIE" | "SERIES";
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerQuery, setProviderQuery] = useState("");

  useEffect(() => {
    const q = vodOnly ? "?vod=1" : "";
    fetch(`/api/admin/stream-providers${q}`)
      .then((r) => r.json())
      .then((d) => setProviders((d.providers ?? []).filter((p: Provider) => p.isActive)));
  }, [vodOnly]);

  const filteredProviders = useMemo(() => {
    const q = providerQuery.trim().toLowerCase();
    let list = providers;
    if (q) {
      list = providers.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.providerType ?? "").toLowerCase().includes(q) ||
          (p.baseUrl ?? "").toLowerCase().includes(q)
      );
    }
    if (providerId && !list.some((p) => p.id === providerId)) {
      const current = providers.find((p) => p.id === providerId);
      if (current) list = [current, ...list];
    }
    return list;
  }, [providers, providerQuery, providerId]);

  function pickChannel(match: ProviderChannelMatch) {
    onChange({
      useProvider: true,
      providerId: match.providerId,
      providerPath: match.providerPath ?? "",
    });
  }

  return (
    <div
      className="rounded border p-3 space-y-3"
      style={{ borderColor: "var(--border)", background: "rgba(94,184,232,0.06)" }}
    >
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={useProvider}
          onChange={(e) => onChange({ providerId, providerPath, useProvider: e.target.checked })}
        />
        Hosted by external provider (use provider’s URL)
      </label>
      {useProvider ? (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Playback resolves through the selected provider so viewers hit the provider URL directly.
            Configure providers under sidebar → Providers → Manage Providers.
          </p>
          <SourceChannelFinder
            streamType={streamType}
            label="Search channel across providers"
            hint="Type a channel name to see which providers on this panel already carry it — click Use provider to fill provider + path."
            onPickProvider={pickChannel}
          />
          <input
            type="search"
            placeholder="Filter provider list by name, type, or URL…"
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={providerQuery}
            onChange={(e) => setProviderQuery(e.target.value)}
          />
          <select
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={providerId}
            onChange={(e) =>
              onChange({ providerId: e.target.value, providerPath, useProvider: true })
            }
          >
            <option value="">
              {filteredProviders.length
                ? "Select provider"
                : providerQuery.trim()
                  ? "No providers match your filter"
                  : "Select provider"}
            </option>
            {filteredProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.providerType ? ` (${p.providerType})` : ""}
              </option>
            ))}
          </select>
          {providerQuery.trim() && filteredProviders.length > 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {filteredProviders.length} provider{filteredProviders.length === 1 ? "" : "s"} in list
            </p>
          ) : null}
          <input
            placeholder="Provider path or content ID *"
            required={useProvider}
            className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
            style={{ borderColor: "var(--border)" }}
            value={providerPath}
            onChange={(e) =>
              onChange({ providerId, providerPath: e.target.value, useProvider: true })
            }
          />
        </>
      ) : null}
    </div>
  );
}

export function OnDemandStreamFields({
  vodMode,
  archiveDays,
  playlistUrl,
  onChange,
}: {
  vodMode: string;
  archiveDays: string;
  playlistUrl: string;
  onChange: (next: { vodMode: string; archiveDays: string; playlistUrl: string }) => void;
}) {
  return (
    <div
      className="rounded border p-3 space-y-3"
      style={{ borderColor: "var(--border)", background: "rgba(232,184,94,0.06)" }}
    >
      <p className="text-sm font-medium">On-demand / replay</p>
      <select
        className="w-full rounded border px-3 py-2 bg-transparent text-sm"
        style={{ borderColor: "var(--border)" }}
        value={vodMode}
        onChange={(e) => onChange({ vodMode: e.target.value, archiveDays, playlistUrl })}
      >
        <option value="LIVE">Live only</option>
        <option value="ON_DEMAND">On demand (direct file/HLS replay)</option>
        <option value="CATCHUP">Catch-up / timeshift</option>
      </select>
      {vodMode === "CATCHUP" && (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Rolling archive on the stream server — nginx timeshift + panel archive pack. No full DVR
            pipeline required.
          </p>
          <input
            type="number"
            min={1}
            placeholder="Archive days (default 7)"
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={archiveDays}
            onChange={(e) => onChange({ vodMode, archiveDays: e.target.value, playlistUrl })}
          />
        </>
      )}
      {(vodMode === "ON_DEMAND" || vodMode === "CATCHUP") && (
        <input
          placeholder="Optional replay playlist / HLS URL"
          className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
          style={{ borderColor: "var(--border)" }}
          value={playlistUrl}
          onChange={(e) => onChange({ vodMode, archiveDays, playlistUrl: e.target.value })}
        />
      )}
    </div>
  );
}
