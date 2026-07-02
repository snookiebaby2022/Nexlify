"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PlexIntegrationPage() {
  const [items, setItems] = useState<{ id: string; name: string; lastSync: string | null }[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    url: "",
    token: "",
    serverId: "",
    transcodeProfile: "1080p",
  });

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
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "plex", ...form }),
    });
    setForm({ name: "", url: "", token: "", serverId: "", transcodeProfile: "1080p" });
    load();
  }

  async function sync(id: string) {
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id, serverId: form.serverId || null }),
    });
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/import/migrate" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Tools
      </Link>
      <h1 className="text-2xl font-semibold">Plex import</h1>
      <p className="text-sm opacity-70">
        Connect a Plex server (URL + token). Sync uses Plex JSON API and builds HLS transcode URLs
        with fixed bitrate/resolution (stricter than generic universal links).
      </p>
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
          <option value="">Default server</option>
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
          <li key={i.id} className="flex justify-between border rounded px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <span>{i.name}</span>
            <button type="button" onClick={() => sync(i.id)} style={{ color: "var(--accent)" }}>
              Sync to panel
            </button>
          </li>
        ))}
            <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
        Sync adds streams to the <strong>Plugin imports</strong> bouquet on all active lines.
      </p>
      </ul>
    </div>
  );
}
