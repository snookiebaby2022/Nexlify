"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { formatDateTime } from "@/lib/format";

export type HostedMediaType = "emby" | "jellyfin" | "youtube";

type IntegrationRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastSync: string | null;
  config: Record<string, unknown>;
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
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/integrations?type=${def.type}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, [def.type]);

  useEffect(() => {
    load();
  }, [load]);

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

    const res = await fetch("/api/admin/integrations", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    setMsg(editId ? "Integration updated." : "Integration added.");
    resetForm();
    load();
  }

  async function sync(id: string) {
    setSyncing(id);
    setMsg("");
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
      setMsg(
        `Synced ${data.imported ?? 0} stream(s). Content is in the “Plugin imports” bouquet on all active lines.`
      );
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <FormPageShell title={def.title} manageHref="/admin/addons" manageLabel="Addons">
      <div className="space-y-6 max-w-2xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {def.description}
        </p>

        {msg && (
          <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {msg}
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
            <button type="submit" className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
              {editId ? "Update" : "Add integration"}
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
