"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export default function ChannelOrderPage() {
  const [streams, setStreams] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    const q = categoryId ? `?categoryId=${categoryId}` : "";
    fetch(`/api/admin/tools/channel-order${q}`)
      .then((r) => r.json())
      .then((d) => setStreams(d.streams));
  }, [categoryId]);

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= streams.length) return;
    const next = [...streams];
    [next[i], next[j]] = [next[j], next[i]];
    setStreams(next);
  }

  async function save() {
    const res = await fetch("/api/admin/tools/channel-order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: streams.map((s) => s.id) }),
    });
    setMsg(res.ok ? "Channel order saved" : "Failed");
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Channel order</h1>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>← Tools</Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Order live channels as clients see them in playlists. <strong>Total: {streams.length} channels</strong></p>
      <div className="flex flex-wrap gap-2 items-center">
        <select className="rounded border px-3 py-2 bg-transparent text-sm" style={{ borderColor: "var(--border)" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => {
            const sorted = [...streams].sort((a, b) => a.name.localeCompare(b.name));
            setStreams(sorted);
            setMsg("Alphabetical order applied. Save to confirm.");
          }}
        >
          Sort A-Z
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => {
            if (!confirm("Reset to original server order?")) return;
            load();
            setMsg("Reset to original order.");
          }}
        >
          Reset to Default
        </button>
        <div className="flex-1" />
        <button type="button" onClick={save} className="rounded px-4 py-2 cursor-pointer text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Save order</button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {streams.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 rounded border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <span className="text-xs tabular-nums w-8 text-right shrink-0" style={{ color: "var(--muted)" }}>{i + 1}</span>
            <span className="flex-1 text-sm truncate">{s.name}</span>
            <div className="flex gap-1">
              <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-xs cursor-pointer hover:bg-white/10" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-xs cursor-pointer hover:bg-white/10" onClick={() => move(i, 1)}>↓</button>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
