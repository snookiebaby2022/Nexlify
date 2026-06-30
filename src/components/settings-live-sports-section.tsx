"use client";

import { useEffect, useState } from "react";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";
import {
  SPORTS_API_PRESETS,
  emptyProvider,
  newProviderId,
  providerFromPreset,
  type LiveSportsProvider,
  type LiveSportsSettings,
} from "@/lib/live-sports-types";

export function LiveSportsSettingsSection({ id = "live-sports" }: { id?: string }) {
  const [data, setData] = useState<LiveSportsSettings>({
    enabled: true,
    cacheTtlSec: 900,
    providers: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [presetIdx, setPresetIdx] = useState("0");
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/settings?group=live-sports")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings ?? {};
        setData({
          enabled: s.enabled !== false,
          cacheTtlSec: Number(s.cacheTtlSec ?? 900) || 900,
          providers: Array.isArray(s.providers) ? s.providers : [],
        });
        setLoading(false);
      });
  }, []);

  function updateProvider(id: string, patch: Partial<LiveSportsProvider>) {
    setData((prev) => ({
      ...prev,
      providers: prev.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removeProvider(id: string) {
    setData((prev) => ({ ...prev, providers: prev.providers.filter((p) => p.id !== id) }));
  }

  function addPreset() {
    const idx = Number(presetIdx);
    const sharedKey = data.providers.find((p) => p.apiKey.trim())?.apiKey ?? "";
    setData((prev) => ({
      ...prev,
      providers: [...prev.providers, providerFromPreset(Number.isFinite(idx) ? idx : 0, sharedKey)],
    }));
  }

  function addBlank() {
    setData((prev) => ({
      ...prev,
      providers: [...prev.providers, emptyProvider({ id: newProviderId() })],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: "live-sports", settings: data }),
      });
      const j = await res.json();
      setMsg(res.ok ? "Live sports settings saved." : j.error ?? "Save failed");
    } catch {
      setMsg("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  async function testProvider(provider: LiveSportsProvider) {
    setTestMsg((m) => ({ ...m, [provider.id]: "Testing…" }));
    const res = await fetch("/api/admin/sports/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const j = await res.json();
    setTestMsg((m) => ({
      ...m,
      [provider.id]: j.ok ? `OK — ${j.count} fixture(s)` : j.error ?? "Failed",
    }));
  }

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading live sports settings…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-4" id={id}>
      <SettingsPanel
        title="Live Sports Integration"
        info="Add one or more sports API endpoints (football, NBA, UFC, NHL, etc.). Keys are stored in panel settings — no server restart required. Legacy env var API_SPORTS_KEY still works as a fallback when no providers are saved."
      >
        <div className="grid md:grid-cols-3 gap-4 w-full mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer md:col-span-2">
            <input
              type="checkbox"
              checked={data.enabled}
              onChange={(e) => setData({ ...data, enabled: e.target.checked })}
            />
            Enable Live Sports widget on admin dashboard
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Cache TTL (seconds)</span>
            <input
              type="number"
              min={60}
              max={86400}
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              value={data.cacheTtlSec}
              onChange={(e) => setData({ ...data, cacheTtlSec: Number(e.target.value) || 900 })}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            className="rounded border px-3 py-2 text-sm panel-select bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={presetIdx}
            onChange={(e) => setPresetIdx(e.target.value)}
          >
            {SPORTS_API_PRESETS.map((p, i) => (
              <option key={p.label} value={String(i)}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={addPreset} className="rounded px-3 py-2 text-sm border" style={{ borderColor: "var(--border)" }}>
            Add preset
          </button>
          <button type="button" onClick={addBlank} className="rounded px-3 py-2 text-sm border" style={{ borderColor: "var(--border)" }}>
            Add custom URL
          </button>
        </div>

        {!data.providers.length && (
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            No providers yet — add Football + Basketball + MMA with the same API-Sports key, or paste custom fixture URLs.
          </p>
        )}

        <div className="space-y-4 w-full">
          {data.providers.map((p, index) => (
            <div
              key={p.id}
              className="rounded-lg border p-4 space-y-3"
              style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                  />
                  Provider {index + 1}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => testProvider(p)}
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border text-red-400"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => removeProvider(p.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {testMsg[p.id] && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>{testMsg[p.id]}</p>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span style={{ color: "var(--muted)" }}>Display label</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={p.label}
                    onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                    placeholder="Premier League"
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--muted)" }}>API key</span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
                    style={{ borderColor: "var(--border)" }}
                    value={p.apiKey}
                    onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                    placeholder="Your API-Sports key"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span style={{ color: "var(--muted)" }}>Fixtures URL</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
                    style={{ borderColor: "var(--border)" }}
                    value={p.fixturesUrl}
                    onChange={(e) => updateProvider(p.id, { fixturesUrl: e.target.value })}
                    placeholder="https://v3.football.api-sports.io/fixtures?next=10"
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--muted)" }}>Auth header name</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
                    style={{ borderColor: "var(--border)" }}
                    value={p.authHeader}
                    onChange={(e) => updateProvider(p.id, { authHeader: e.target.value })}
                    placeholder="x-apisports-key"
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: "var(--muted)" }}>Authorization scheme</span>
                  <select
                    className="mt-1 w-full rounded border px-3 py-2 panel-select bg-transparent text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={p.authScheme}
                    onChange={(e) =>
                      updateProvider(p.id, {
                        authScheme: e.target.value as LiveSportsProvider["authScheme"],
                      })
                    }
                  >
                    <option value="">Header value only (API-Sports)</option>
                    <option value="Bearer">Bearer token</option>
                    <option value="ApiKey">ApiKey prefix</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      </SettingsPanel>

      <SettingsSaveBar saving={saving} msg={msg} />
    </form>
  );
}
