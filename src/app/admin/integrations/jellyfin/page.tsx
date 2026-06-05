"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function JellyfinIntegrationPage() {
  const [items, setItems] = useState<{ id: string; name: string; lastSync: string | null }[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ name: "", url: "", apiKey: "", serverId: "" });

  function load() {
    fetch("/api/admin/integrations?type=jellyfin")
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
      body: JSON.stringify({ type: "jellyfin", ...form, token: form.apiKey }),
    });
    setForm({ name: "", url: "", apiKey: "", serverId: "" });
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
      <Link href="/admin/addons" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Addons
      </Link>
      <h1 className="text-2xl font-semibold">Jellyfin</h1>
      <p className="text-sm opacity-70">
        Connect a Jellyfin server (URL + API key). Sync imports movies and series as hosted streams.
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
          placeholder="http://jellyfin.local:8096"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          required
        />
        <input
          placeholder="API key"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          required
        />
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
          Add Jellyfin server
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
