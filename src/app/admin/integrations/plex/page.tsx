"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { IntegrationProgressCard } from "@/components/integration-progress-card";
import { PlexAutoSyncStatus } from "@/components/plex-auto-sync-status";
import type { IntegrationSyncProgress } from "@/lib/integration-sync-types";

type PlexItem = {
  id: string;
  name: string;
  isActive: boolean;
  lastSync: string | null;
  syncProgress?: IntegrationSyncProgress | null;
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
    skipExistingCatalog?: boolean;
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
  skipExistingCatalog: true,
  isActive: true,
};

type LocalProgress = IntegrationSyncProgress;

function localProgress(jobId: string, message: string, steps: string[]): LocalProgress {
  return {
    jobId,
    status: "running",
    phase: "add",
    message,
    current: steps.length,
    total: 4,
    imported: 0,
    skipped: 0,
    steps: steps.map((text, i) => ({ at: `${i}`, text })),
    updatedAt: new Date().toISOString(),
  };
}

export default function PlexIntegrationPage() {
  const [items, setItems] = useState<PlexItem[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingLibs, setLoadingLibs] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [addProgress, setAddProgress] = useState<LocalProgress | null>(null);
  const [syncProgress, setSyncProgress] = useState<IntegrationSyncProgress | null>(null);

  function load() {
    fetch("/api/admin/integrations?type=plex")
      .then((r) => r.json())
      .then((d) => {
        const next = (d.items ?? []) as PlexItem[];
        setItems(next);
        const running = next.find((i) => i.syncProgress?.status === "running");
        if (running?.syncProgress) {
          setError("");
          setSyncProgress(running.syncProgress);
          setSyncing(running.id);
          return;
        }
        const failed = next.find((i) => i.syncProgress?.status === "error");
        if (failed?.syncProgress) {
          setSyncProgress(failed.syncProgress);
          setError(failed.syncProgress.error || failed.syncProgress.message || "Plex sync failed");
        }
      });
    fetch("/api/admin/servers").then((r) => r.json()).then((d) => setServers(d.servers ?? []));
  }

  useEffect(() => {
    load();
  }, []);

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
        setMessage(progress.message);
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
  }, [syncing]);

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
      skipExistingCatalog: c.skipExistingCatalog !== false,
      isActive: item.isActive !== false,
    });
    setLibraries([]);
    if (item.syncProgress) setSyncProgress(item.syncProgress);
  }

  async function refreshLibraries(targetId?: string) {
    const id = targetId ?? editId;
    if (!id) {
      setError("Save the server first, then refresh libraries.");
      return [];
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
      const libs = (data.libraries ?? []) as Library[];
      setLibraries(libs);
      return libs;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Library refresh failed");
      return [];
    } finally {
      setLoadingLibs(false);
    }
  }

  async function testSaved(id: string) {
    setTesting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection test failed");
      if (Array.isArray(data.libraries)) setLibraries(data.libraries);
      setMessage(data.message ?? "Plex connection OK.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
      return false;
    } finally {
      setTesting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    const steps: string[] = [];
    const jobId = "add";
    const push = (text: string) => {
      steps.push(text);
      setAddProgress(localProgress(jobId, text, steps));
    };
    try {
      push("Saving Plex server…");
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
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const id = String(data.item?.id ?? editId);
      setEditId(id);
      push("Connecting to Plex…");
      const ok = await testSaved(id);
      if (ok) {
        push("Loading libraries…");
        const libs = await refreshLibraries(id);
        push(
          libs.length
            ? `Found ${libs.length} librar${libs.length === 1 ? "y" : "ies"}. Ready to sync.`
            : "Connected. Use Sync to import."
        );
        setAddProgress({
          ...localProgress(jobId, steps[steps.length - 1], steps),
          status: "done",
          current: 4,
          total: 4,
        });
      } else {
        setAddProgress({
          ...localProgress(jobId, "Saved, but Plex did not accept the connection.", steps),
          status: "error",
        });
      }
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      setAddProgress({
        ...localProgress(jobId, msg, steps),
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function sync(id: string) {
    setSyncing(id);
    setError("");
    setMessage("");
    setSyncProgress({
      jobId: "pending",
      status: "running",
      phase: "queued",
      message: "Starting Plex sync…",
      current: 0,
      total: 0,
      imported: 0,
      skipped: 0,
      steps: [{ at: new Date().toISOString(), text: "Starting Plex sync…" }],
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
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/addons" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Addons
      </Link>
      <h1 className="text-2xl font-semibold">Plex sync</h1>
      <p className="text-sm opacity-70">
        Connect a remote Plex server, pick a library, and sync only titles that are not already
        on this panel. Auto-sync runs every 12 or 24 hours from{" "}
        <Link href="/admin/settings/cron" className="underline" style={{ color: "var(--accent)" }}>
          Scheduled tasks
        </Link>
        .
      </p>
      <PlexAutoSyncStatus />

      {addProgress && <IntegrationProgressCard progress={addProgress} title="Add / update" />}
      {syncProgress && <IntegrationProgressCard progress={syncProgress} title="Library sync" />}

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
              placeholder="IP, hostname, or http://host:port"
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
              placeholder="Plex username (optional if you paste a token)"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              type="password"
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="Plex password (optional if you paste a token)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <input
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="X-Plex-Token or Plex XML URL"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              required={!editId && !form.username}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Paste the token or the whole XML URL (including <code>?X-Plex-Token=</code>). Find it in Plex Web → any
              item → Get Info → View XML, or see{" "}
              <a
                href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                Plex token guide
              </a>
              . Username and password can also sign in via plex.tv.
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.skipExistingCatalog}
              onChange={(e) => setForm({ ...form, skipExistingCatalog: e.target.checked })}
            />
            Skip titles already on this panel
          </label>
        </div>
        <p className="text-xs -mt-2" style={{ color: "var(--muted)" }}>
          Movies and series that already exist in your IPTV catalog are not imported again (matched by title,
          ignoring year/quality tags). Already-synced Plex items are not rewritten, which keeps sync fast.
        </p>

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

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded px-4 py-2 text-white"
            style={{ background: "var(--accent)" }}
          >
            {saving ? "Working…" : editId ? "Update" : "Add Plex server"}
          </button>
          {editId && (
            <>
              <button
                type="button"
                disabled={testing}
                className="rounded px-4 py-2 border"
                style={{ borderColor: "var(--border)" }}
                onClick={() => void testSaved(editId)}
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                className="rounded px-4 py-2 border"
                style={{ borderColor: "var(--border)" }}
                onClick={() => {
                  setEditId(null);
                  setForm(emptyForm);
                  setLibraries([]);
                  setAddProgress(null);
                }}
              >
                Cancel
              </button>
            </>
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
              {i.syncProgress?.status === "running" && (
                <p className="text-xs mt-0.5" style={{ color: "var(--accent)" }}>
                  {i.syncProgress.message}
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
                {syncing === i.id ? "Syncing…" : "Sync"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
