"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/format";

type PlexItem = {
  id: string;
  name: string;
  isActive: boolean;
  lastSync: string | null;
  config?: {
    host?: string;
    port?: number | string;
    url?: string;
    username?: string;
    token?: string;
    serverId?: string | null;
    directStream?: boolean;
    libraryKey?: string;
    libraryTitle?: string;
    transcodeProfile?: string;
  };
};

type Library = { key: string; title: string; type: string };

const emptyForm = {
  name: "",
  host: "",
  port: "32400",
  username: "",
  password: "",
  token: "",
  serverId: "",
  libraryKey: "",
  libraryTitle: "",
  transcodeProfile: "direct",
  directStream: true,
  isActive: true,
};

export default function PlexIntegrationPage() {
  const [items, setItems] = useState<PlexItem[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [loadingLibs, setLoadingLibs] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/integrations?type=plex")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
    fetch("/api/admin/servers").then((r) => r.json()).then((d) => setServers(d.servers ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  function loadIntoForm(item: PlexItem) {
    const c = item.config ?? {};
    setEditId(item.id);
    setForm({
      name: item.name,
      host: c.host ?? (c.url ? c.url.replace(/^https?:\/\//, "").split(":")[0] : ""),
      port: String(c.port ?? (c.url?.match(/:(\d+)/)?.[1] ?? "32400")),
      username: c.username ?? "",
      password: "",
      token: c.token ?? "",
      serverId: c.serverId ?? "",
      libraryKey: c.libraryKey ?? "",
      libraryTitle: c.libraryTitle ?? "",
      transcodeProfile: c.transcodeProfile ?? "direct",
      directStream: c.directStream !== false,
      isActive: item.isActive !== false,
    });
    setLibraries([]);
  }

  async function refreshLibraries(targetId?: string) {
    const id = targetId ?? editId;
    if (!id) {
      setError("Save the server first, then refresh libraries.");
      return;
    }
    setLoadingLibs(true);
    setError("");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "libraries", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load libraries");
      setLibraries(data.libraries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Library refresh failed");
    } finally {
      setLoadingLibs(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const payload = {
      type: "plex",
      ...form,
      port: form.port,
      serverId: form.serverId || null,
      libraryKey: form.libraryKey || undefined,
      libraryTitle: form.libraryTitle || undefined,
    };
    const res = await fetch("/api/admin/integrations", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setMessage(editId ? "Plex server updated." : "Plex server added.");
    setEditId(data.item?.id ?? editId);
    setForm(emptyForm);
    setEditId(null);
    load();
  }

  async function sync(id: string) {
    setSyncing(id);
    setError("");
    setMessage("");
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
      setMessage(
        `Sync complete: ${data.imported ?? 0} new · ${data.skipped ?? 0} updated · ${data.episodes ?? 0} episodes`
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/addons" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Addons
      </Link>
      <h1 className="text-2xl font-semibold">Plex sync</h1>
      <p className="text-sm opacity-70">
        XUI-style Plex import: remote Plex server, optional direct stream through your LB, library pick, sync to panel
        VOD.
      </p>

      {message && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <form onSubmit={save} className="space-y-4 text-sm border rounded-lg p-4" style={{ borderColor: "var(--border)" }}>
        <label className="block">
          <span className="font-medium">Server name</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>

        <div>
          <span className="font-medium">Plex server</span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <input
              className="col-span-2 rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="IP or hostname"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              required
            />
            <input
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="Port"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
          </div>
        </div>

        <div>
          <span className="font-medium">Credentials</span>
          <div className="grid gap-2 mt-1">
            <input
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="Plex username (optional)"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              type="password"
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="Plex password (optional)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <input
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="X-Plex-Token (required)"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              required={!editId}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Required for Plex API access (library list, sync, playback). Find it in Plex Web → any item →
              Get Info → View XML — the token is in the URL, or see{" "}
              <a
                href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                Plex token guide
              </a>
              .
            </p>
          </div>
        </div>

        <label className="block">
          <span className="font-medium">Remote streaming server (LB)</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2 panel-select bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.serverId}
            onChange={(e) => setForm({ ...form, serverId: e.target.value })}
          >
            <option value="">— Panel default —</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-xs mt-1 block" style={{ color: "var(--muted)" }}>
            Imported streams use this server for playback routing (provider LB).
          </span>
        </label>

        <div>
          <span className="font-medium">Library</span>
          <div className="flex gap-2 mt-1">
            <select
              className="flex-1 rounded border px-3 py-2 panel-select bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.libraryKey}
              onChange={(e) => {
                const lib = libraries.find((l) => l.key === e.target.value);
                setForm({
                  ...form,
                  libraryKey: e.target.value,
                  libraryTitle: lib?.title ?? form.libraryTitle,
                });
              }}
            >
              <option value="">All movie/show libraries</option>
              {libraries.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.title} ({l.type})
                </option>
              ))}
              {form.libraryKey && !libraries.some((l) => l.key === form.libraryKey) && form.libraryTitle && (
                <option value={form.libraryKey}>{form.libraryTitle}</option>
              )}
            </select>
            <button
              type="button"
              disabled={loadingLibs || !editId}
              onClick={() => void refreshLibraries()}
              className="rounded border px-3 py-2"
              style={{ borderColor: "var(--border)" }}
              title="Refresh libraries"
            >
              <RefreshCw size={16} className={loadingLibs ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.directStream}
              onChange={(e) => setForm({ ...form, directStream: e.target.checked })}
            />
            Direct stream
          </label>
        </div>

        <select
          className="w-full rounded border px-3 py-2 panel-select bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.transcodeProfile}
          onChange={(e) => setForm({ ...form, transcodeProfile: e.target.value })}
        >
          <option value="direct">Direct play (fallback transcode)</option>
          <option value="1080p">Transcode 1080p</option>
          <option value="720p">Transcode 720p</option>
          <option value="480p">Transcode 480p</option>
        </select>

        <div className="flex gap-2">
          <button type="submit" className="rounded px-4 py-2 text-white" style={{ background: "var(--accent)" }}>
            {editId ? "Update" : "Add Plex server"}
          </button>
          {editId && (
            <button
              type="button"
              className="rounded px-4 py-2 border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => {
                setEditId(null);
                setForm(emptyForm);
                setLibraries([]);
              }}
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
              {!i.isActive && (
                <span className="ml-2 text-xs text-amber-400">Disabled</span>
              )}
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
                onClick={() => sync(i.id)}
                style={{ color: "var(--accent)" }}
              >
                {syncing === i.id ? "Syncing…" : "Sync"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
