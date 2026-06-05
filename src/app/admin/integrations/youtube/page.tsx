"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function YoutubeIntegrationPage() {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ name: "", channelUrl: "", serverId: "" });

  function load() {
    fetch("/api/admin/integrations?type=youtube")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "youtube", name: form.name, channelUrl: form.channelUrl }),
    });
    load();
  }

  async function sync(id: string) {
    await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id }),
    });
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">YouTube channels</h1>
      <p className="text-sm opacity-70">
        Registers a YouTube channel as a live stream entry. Use yt-dlp or a relay on your stream
        server to produce a playable HLS URL.
      </p>
      <form onSubmit={add} className="space-y-3 text-sm border rounded-lg p-4" style={{ borderColor: "var(--border)" }}>
        <input
          placeholder="Channel name"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="https://www.youtube.com/@channel"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.channelUrl}
          onChange={(e) => setForm({ ...form, channelUrl: e.target.value })}
          required
        />
        <button type="submit" className="rounded px-4 py-2" style={{ background: "var(--accent)", color: "#fff" }}>
          Add channel
        </button>
      </form>
      <ul className="text-sm space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between border rounded px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <span>{i.name}</span>
            <button type="button" onClick={() => sync(i.id)} style={{ color: "var(--accent)" }}>
              Import
            </button>
          </li>
        ))}
      </ul>
      <Link href="/admin/integrations/plex" className="text-sm" style={{ color: "var(--accent)" }}>
        Plex import →
      </Link>
    </div>
  );
}
