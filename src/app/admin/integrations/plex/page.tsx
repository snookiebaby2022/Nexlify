"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type PlexItem = {
  id: string;
  name: string;
  lastSync: string | null;
};

export default function PlexIntegrationPage() {
  const [items, setItems] = useState<PlexItem[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    url: "",
    token: "",
    serverId: "",
    transcodeProfile: "1080p",
  });
  const [syncing, setSyncing] = useState<string | null>(null);
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "plex", ...form }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to add Plex server");
      return;
    }
    setForm({ name: "", url: "", token: "", serverId: "", transcodeProfile: "1080p" });
    setMessage("Plex server added.");
    load();
  }

  async function sync(id: string) {
    setSyncing(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", id, serverId: form.serverId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      const parts = [
        `${data.imported ?? 0} new`,
        `${data.skipped ?? 0} updated/skipped`,
      ];
      if (data.episodes) parts.push(`${data.episodes} episodes`);
      if (data.warnings?.length) parts.push(data.warnings.join("; "));
      setMessage(`Sync complete: ${parts.join(" · ")}`);
      load();
    } catch {
      setError("Network error during sync");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/import/migrate" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Tools
      </Link>
      <h1 className="text-2xl font-semibold">Plex import</h1>
      <p className="text-sm opacity-70">
        Connect a Plex server (URL + token). Sync imports movies and TV episodes into the panel with
        HLS playback (direct play or transcode profile).
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

      <form onSubmit={add} className="space-y-3 text-sm border rounded-lg p-4" style={{ borderColor: "var(--border)" }}>
        <input
          placeholder="Name"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="http://plex.local:32400"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          required
        />
        <input
          placeholder="X-Plex-Token"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value })}
          required
        />
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.transcodeProfile}
          onChange={(e) => setForm({ ...form, transcodeProfile: e.target.value })}
        >
          <option value="1080p">Transcode 1080p (12 Mbps)</option>
          <option value="720p">Transcode 720p (4 Mbps)</option>
          <option value="480p">Transcode 480p (2 Mbps)</option>
          <option value="direct">Prefer direct play (fallback transcode)</option>
        </select>
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.serverId}
          onChange={(e) => setForm({ ...form, serverId: e.target.value })}
        >
          <option value="">Default server (used on sync)</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded px-4 py-2" style={{ background: "var(--accent)", color: "#fff" }}>
          Add Plex server
        </button>
      </form>

      <ul className="text-sm space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border rounded px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <div>
              <span className="font-medium">{i.name}</span>
              {i.lastSync && (
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Last sync: {formatDateTime(i.lastSync)}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={syncing === i.id}
              onClick={() => sync(i.id)}
              style={{ color: "var(--accent)" }}
            >
              {syncing === i.id ? "Syncing…" : "Sync to panel"}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Sync adds streams to the <strong>Plugin imports</strong> bouquet on all active lines. TV shows
        import as individual episodes (playable).
      </p>
    </div>
  );
}
