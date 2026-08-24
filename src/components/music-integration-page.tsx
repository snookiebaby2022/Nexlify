"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import type { MusicAddonDef } from "@/lib/music-addons-catalog";
import { IntegrationProgressCard } from "@/components/integration-progress-card";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

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
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [licenses, setLicenses] = useState<{ id: string; label: string; expiresAt: string | null }[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null);
  const [addProgress, setAddProgress] = useState<IntegrationSyncProgress | null>(null);
  const [syncProgress, setSyncProgress] = useState<IntegrationSyncProgress | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/integrations?type=${addon.id}`)
      .then((r) => r.json())
      .then((d) => {
        const items = d.items ?? [];
        if (items[0]) {
          const i = items[0] as IntegrationRow & { syncProgress?: IntegrationSyncProgress };
          setRow(i);
          setName(i.name);
          const cfg = (i.config ?? {}) as Record<string, string>;
          const next: Record<string, string> = {};
          for (const f of addon.fields) next[f.key] = cfg[f.key] ?? "";
          setConfig(next);
          setServerId(String(cfg.serverId ?? ""));
          if (i.syncProgress?.status === "running") {
            setSyncProgress(i.syncProgress);
            setBusy("sync");
          } else if (i.syncProgress) {
            setSyncProgress(i.syncProgress);
          }
        }
      });
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
    fetch(`/api/admin/addon-licenses?service=${addon.id}`)
      .then((r) => r.json())
      .then((d) => setLicenses(d.licenses ?? []));
  }, [addon.id, addon.fields]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (busy !== "sync" || !row) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-status", id: row.id }),
      });
      const data = await res.json();
      if (cancelled) return;
      const progress = data.progress as IntegrationSyncProgress | null;
      if (progress) setSyncProgress(progress);
      if (progress?.status === "done") {
        setMsg(progress.message);
        setBusy(null);
        load();
      } else if (progress?.status === "error") {
        setError(progress.error || progress.message || "Sync failed");
        setBusy(null);
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 900);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [busy, row, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setBusy("save");
    setAddProgress({
      jobId: "add",
      status: "running",
      phase: "save",
      message: "Saving integration…",
      current: 1,
      total: 2,
      imported: 0,
      skipped: 0,
      steps: [{ at: "1", text: "Saving integration…" }],
      updatedAt: new Date().toISOString(),
    });
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: addon.id,
          name,
          serverId: serverId || null,
          ...config,
          config,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMsg("Saved.");
      setAddProgress({
        jobId: "add",
        status: "done",
        phase: "done",
        message: "Saved. Use Test connection, then Sync to panel.",
        current: 2,
        total: 2,
        imported: 0,
        skipped: 0,
        steps: [
          { at: "1", text: "Saving integration…" },
          { at: "2", text: "Saved. Use Test connection, then Sync to panel." },
        ],
        updatedAt: new Date().toISOString(),
      });
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      setAddProgress((prev) => (prev ? { ...prev, status: "error", message, error: message } : prev));
    } finally {
      setBusy(null);
    }
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
      setError("Save integration first.");
      return;
    }
    setBusy("test");
    setMsg("");
    setError("");
    setAddProgress({
      jobId: "test",
      status: "running",
      phase: "test",
      message: "Testing connection…",
      current: 1,
      total: 1,
      imported: 0,
      skipped: 0,
      steps: [{ at: "1", text: "Testing connection…" }],
      updatedAt: new Date().toISOString(),
    });
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: row.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      const message = data.message ?? "Connection OK";
      setMsg(message);
      setAddProgress({
        jobId: "test",
        status: "done",
        phase: "done",
        message,
        current: 1,
        total: 1,
        imported: 0,
        skipped: 0,
        steps: [{ at: "1", text: message }],
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Test failed";
      setError(message);
      setAddProgress((prev) => (prev ? { ...prev, status: "error", message, error: message } : prev));
    } finally {
      setBusy(null);
    }
  }

  async function syncToPanel() {
    if (!row) {
      setError("Save integration first.");
      return;
    }
    setBusy("sync");
    setMsg("");
    setError("");
    setSyncProgress({
      jobId: "pending",
      status: "running",
      phase: "queued",
      message: "Starting sync…",
      current: 0,
      total: 0,
      imported: 0,
      skipped: 0,
      steps: [{ at: new Date().toISOString(), text: "Starting sync…" }],
      updatedAt: new Date().toISOString(),
    });
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", id: row.id, serverId: serverId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      if (data.progress) setSyncProgress(data.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setBusy(null);
    }
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
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Remote streaming server (LB)</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2 panel-select bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
            >
              <option value="">— Panel default —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-xs mt-1 block" style={{ color: "var(--muted)" }}>
              Imported tracks route playback through this load-balancer server.
            </span>
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" disabled={busy === "save"} className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
              {busy === "save" ? "Saving…" : "Save integration"}
            </button>
            {row && (
              <>
                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={testConnection}
                  disabled={busy === "test"}
                >
                  {busy === "test" ? "Testing…" : "Test connection"}
                </button>
                <button
                  type="button"
                  className="btn-positive rounded px-4 py-2 text-sm cursor-pointer"
                  onClick={syncToPanel}
                  disabled={busy === "sync"}
                >
                  {busy === "sync" ? "Syncing…" : "Sync to panel"}
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
          {addProgress && <IntegrationProgressCard progress={addProgress} title="Save / test" />}
          {syncProgress && <IntegrationProgressCard progress={syncProgress} title="Sync" />}
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
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
