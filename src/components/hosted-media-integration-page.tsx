"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { formatDateTime } from "@/lib/format";
import { IntegrationProgressCard } from "@/components/integration-progress-card";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

export type HostedMediaType = "emby" | "jellyfin" | "youtube";

type IntegrationRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastSync: string | null;
  config: Record<string, unknown>;
  syncProgress?: IntegrationSyncProgress | null;
};

type HostedMediaIntegrationDef = {
  type: HostedMediaType;
  title: string;
  description: string;
  urlLabel: string;
  urlPlaceholder: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  channelMode?: boolean;
};

export function HostedMediaIntegrationPage({ def }: { def: HostedMediaIntegrationDef }) {
  const [items, setItems] = useState<IntegrationRow[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [serverId, setServerId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addProgress, setAddProgress] = useState<IntegrationSyncProgress | null>(null);
  const [syncProgress, setSyncProgress] = useState<IntegrationSyncProgress | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/integrations?type=${def.type}`)
      .then((r) => r.json())
      .then((d) => {
        const next = (d.items ?? []) as IntegrationRow[];
        setItems(next);
        const running = next.find((i) => i.syncProgress?.status === "running");
        if (running?.syncProgress) {
          setSyncProgress(running.syncProgress);
          setSyncing(running.id);
          return;
        }
        const failed = next.find((i) => i.syncProgress?.status === "error");
        if (failed?.syncProgress) {
          setSyncProgress(failed.syncProgress);
          setError(failed.syncProgress.error || failed.syncProgress.message || "Sync failed");
        }
      });
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, [def.type]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-status", id: syncing }),
      });
      const data = await res.json();
      if (cancelled) return;
      const progress = data.progress as IntegrationSyncProgress | null;
      if (progress) setSyncProgress(progress);
      if (progress?.status === "done") {
        setMsg(progress.message);
        setSyncing(null);
        load();
      } else if (progress?.status === "error") {
        setError(progress.error || progress.message || "Sync failed");
        setSyncing(null);
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 900);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [syncing, load]);

  function loadIntoForm(item: IntegrationRow) {
    const cfg = item.config ?? {};
    setEditId(item.id);
    setName(item.name);
    setUrl(String(cfg.url ?? cfg.channelUrl ?? ""));
    setToken(String(cfg.token ?? ""));
    setServerId(String(cfg.serverId ?? ""));
    setIsActive(item.isActive !== false);
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setUrl("");
    setToken("");
    setServerId("");
    setIsActive(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setSaving(true);
    const steps = ["Saving integration…"];
    setAddProgress({
      jobId: "add",
      status: "running",
      phase: "save",
      message: "Saving integration…",
      current: 1,
      total: 3,
      imported: 0,
      skipped: 0,
      steps: steps.map((text, i) => ({ at: `${i}`, text })),
      updatedAt: new Date().toISOString(),
    });
    const payload: Record<string, unknown> = {
      type: def.type,
      name,
      serverId: serverId || null,
      isActive,
    };
    if (def.channelMode) {
      payload.channelUrl = url;
    } else {
      payload.url = url;
      payload.token = token;
    }

    try {
      const res = await fetch("/api/admin/integrations", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const id = String(data.item?.id ?? editId);
      setEditId(id);
      steps.push("Testing connection…");
      setAddProgress({
        jobId: "add",
        status: "running",
        phase: "test",
        message: "Testing connection…",
        current: 2,
        total: 3,
        imported: 0,
        skipped: 0,
        steps: steps.map((text, i) => ({ at: `${i}`, text })),
        updatedAt: new Date().toISOString(),
      });
      const testRes = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id }),
      });
      const testData = await testRes.json();
      if (!testRes.ok) throw new Error(testData.error ?? "Connection test failed");
      const doneMsg = testData.message ?? (editId ? "Integration updated." : "Integration added.");
      setMsg(doneMsg);
      steps.push(doneMsg);
      setAddProgress({
        jobId: "add",
        status: "done",
        phase: "done",
        message: doneMsg,
        current: 3,
        total: 3,
        imported: 0,
        skipped: 0,
        steps: steps.map((text, i) => ({ at: `${i}`, text })),
        updatedAt: new Date().toISOString(),
      });
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      setAddProgress((prev) =>
        prev
          ? { ...prev, status: "error", message, error: message }
          : {
              jobId: "add",
              status: "error",
              phase: "error",
              message,
              current: 0,
              total: 3,
              imported: 0,
              skipped: 0,
              steps: [],
              error: message,
              updatedAt: new Date().toISOString(),
            }
      );
    } finally {
      setSaving(false);
    }
  }

  async function sync(id: string) {
    setSyncing(id);
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
      const item = items.find((i) => i.id === id);
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          id,
          serverId: item?.config?.serverId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      if (data.progress) setSyncProgress(data.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setSyncing(null);
    }
  }

  return (
    <FormPageShell title={def.title} manageHref="/admin/addons" manageLabel="Addons">
      <div className="space-y-6 max-w-2xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {def.description}
        </p>

        {addProgress && <IntegrationProgressCard progress={addProgress} title="Add / update" />}
        {syncProgress && <IntegrationProgressCard progress={syncProgress} title="Library sync" />}

        {msg && (
          <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
            {msg}
          </p>
        )}
        {error && (
          <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <form onSubmit={save} className="space-y-4 text-sm border rounded-lg p-4" style={{ borderColor: "var(--border)" }}>
          <label className="block">
            <span className="font-medium">Display name</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="font-medium">{def.urlLabel}</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              placeholder={def.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>

          {!def.channelMode && def.tokenLabel && (
            <label className="block">
              <span className="font-medium">{def.tokenLabel}</span>
              <input
                type="password"
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder={def.tokenPlaceholder}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required={!editId}
              />
            </label>
          )}

          <label className="block">
            <span className="font-medium">Remote streaming server (LB)</span>
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
              Imported streams route playback through this load-balancer server.
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Enabled
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
              {saving ? "Working…" : editId ? "Update" : "Add integration"}
            </button>
            {editId && (
              <button
                type="button"
                className="btn-cancel rounded px-4 py-2 text-sm cursor-pointer"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <ul className="text-sm space-y-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 border rounded px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <span className="font-medium">{i.name}</span>
                {!i.isActive && <span className="ml-2 text-xs text-amber-400">Disabled</span>}
                {i.lastSync && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    Last sync: {formatDateTime(i.lastSync)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => loadIntoForm(i)} style={{ color: "var(--muted)" }}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={syncing === i.id}
                  onClick={() => void sync(i.id)}
                  style={{ color: "var(--accent)" }}
                >
                  {syncing === i.id ? "Syncing…" : "Sync to panel"}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <Link href="/admin/integrations/plex" className="text-sm" style={{ color: "var(--accent)" }}>
          Plex import →
        </Link>
      </div>
    </FormPageShell>
  );
}
