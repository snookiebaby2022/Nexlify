"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import type { MusicAddonDef } from "@/lib/music-addons-catalog";

type IntegrationRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastSync: string | null;
  config: Record<string, unknown>;
};

export function MusicIntegrationPage({ addon }: { addon: MusicAddonDef }) {
  const [row, setRow] = useState<IntegrationRow | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [name, setName] = useState(addon.name);
  const [msg, setMsg] = useState("");
  const [licenses, setLicenses] = useState<{ id: string; label: string; expiresAt: string | null }[]>([]);

  const load = useCallback(() => {
    fetch(`/api/admin/integrations?type=${addon.id}`)
      .then((r) => r.json())
      .then((d) => {
        const items = d.items ?? [];
        if (items[0]) {
          const i = items[0] as IntegrationRow;
          setRow(i);
          setName(i.name);
          const cfg = (i.config ?? {}) as Record<string, string>;
          const next: Record<string, string> = {};
          for (const f of addon.fields) next[f.key] = cfg[f.key] ?? "";
          setConfig(next);
        }
      });
    fetch(`/api/admin/addon-licenses?service=${addon.id}`)
      .then((r) => r.json())
      .then((d) => setLicenses(d.licenses ?? []));
  }, [addon.id, addon.fields]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: addon.id,
        name,
        ...config,
        config,
        isActive: true,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setMsg(data.error ?? "Save failed");
      return;
    }
    setMsg("Saved.");
    load();
  }

  async function toggleActive() {
    if (!row) return;
    await fetch("/api/admin/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, isActive: !row.isActive }),
    });
    load();
  }

  async function testConnection() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Testing…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", id: row.id }),
    });
    const data = await res.json();
    setMsg(res.ok ? (data.message ?? "Connection OK") : (data.error ?? "Test failed"));
  }

  async function syncToPanel() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Syncing to panel streams…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id: row.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Sync failed");
      return;
    }
    setMsg(
      `Synced ${data.imported ?? 0} stream(s). Content is in the “Plugin imports” bouquet on all active lines.`
    );
    load();
  }

  return (
    <FormPageShell title={addon.name} manageHref="/admin/addons" manageLabel="Addons">
      <div className="space-y-6">
        <div
          className="rounded-lg border-l-4 p-4 text-sm"
          style={{ borderColor: addon.color, background: "var(--bg-card)" }}
        >
          <p>{addon.description}</p>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Use <strong>Sync to panel</strong> to import playable streams into the
            <strong> Plugin imports</strong> bouquet (auto-attached to active lines).
          </p>
          <a
            href={addon.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline mt-2 inline-block"
            style={{ color: "var(--accent)" }}
          >
            Developer documentation →
          </a>
        </div>

        {licenses.length > 0 && (
          <div className="text-sm rounded border p-3" style={{ borderColor: "var(--border)" }}>
            <strong>Addon licenses:</strong>{" "}
            {licenses.map((l) => l.label).join(", ")}{" "}
            <Link href="/admin/license/addon" className="underline" style={{ color: "var(--accent)" }}>
              Manage
            </Link>
          </div>
        )}

        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Display name</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {addon.fields.map((f) => (
            <label key={f.key} className="block text-sm">
              <span style={{ color: "var(--muted)" }}>{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder={f.placeholder}
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
              Save integration
            </button>
            {row && (
              <>
                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={testConnection}
                >
                  Test connection
                </button>
                <button
                  type="button"
                  className="btn-positive rounded px-4 py-2 text-sm cursor-pointer"
                  onClick={syncToPanel}
                >
                  Sync to panel
                </button>
                <button
                  type="button"
                  className="btn-cancel rounded px-4 py-2 text-sm cursor-pointer"
                  onClick={toggleActive}
                >
                  {row.isActive ? "Disable" : "Enable"}
                </button>
              </>
            )}
            <Link
              href={`/admin/license/addon/add?service=${addon.id}`}
              className="rounded px-4 py-2 text-sm border inline-flex items-center"
              style={{ borderColor: "var(--border)" }}
            >
              Add addon license
            </Link>
          </div>
          {msg && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {msg}
            </p>
          )}
        </form>

        {row?.lastSync && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Last sync: {new Date(row.lastSync).toLocaleString()}
          </p>
        )}
      </div>
    </FormPageShell>
  );
}
