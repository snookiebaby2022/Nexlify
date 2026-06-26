"use client";

import { useEffect, useState } from "react";

type Provider = { id: string; name: string; providerType: string | null; isActive: boolean };

export function ProviderSourceFields({
  providerId,
  providerPath,
  useProvider,
  onChange,
  vodOnly = true,
}: {
  providerId: string;
  providerPath: string;
  useProvider: boolean;
  onChange: (next: { providerId: string; providerPath: string; useProvider: boolean }) => void;
  vodOnly?: boolean;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    const q = vodOnly ? "?vod=1" : "";
    fetch(`/api/admin/stream-providers${q}`)
      .then((r) => r.json())
      .then((d) => setProviders((d.providers ?? []).filter((p: Provider) => p.isActive)));
  }, [vodOnly]);

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
        Hosted by external provider
      </label>
      {useProvider ? (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Pick a configured VOD provider and enter its content path or stream ID. Configure providers under
            Management → VOD Providers.
          </p>
          <select
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={providerId}
            onChange={(e) =>
              onChange({ providerId: e.target.value, providerPath, useProvider: true })
            }
          >
            <option value="">Select provider</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.providerType ? ` (${p.providerType})` : ""}
              </option>
            ))}
          </select>
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
        <input
          type="number"
          min={1}
          placeholder="Archive days (default 7)"
          className="w-full rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          value={archiveDays}
          onChange={(e) => onChange({ vodMode, archiveDays: e.target.value, playlistUrl })}
        />
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
