"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BouquetOrderPage() {
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= bouquets.length) return;
    const next = [...bouquets];
    [next[i], next[j]] = [next[j], next[i]];
    setBouquets(next);
  }

  function dropOnRow(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...bouquets];
    const from = next.findIndex((b) => b.id === dragId);
    const to = next.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setBouquets(next);
    setDragId(null);
  }

  async function save() {
    const res = await fetch("/api/admin/bouquets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: bouquets.map((b) => b.id) }),
    });
    setMsg(res.ok ? "Order saved." : "Failed to save");
    if (res.ok) load();
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
        >
          <h1 className="text-lg font-semibold text-white">Order Bouquets</h1>
          <Link
            href="/admin/bouquets"
            className="text-sm px-4 py-1.5 rounded text-white border border-white/70 hover:bg-white/10"
          >
            Manage Bouquets
          </Link>
        </div>
        <div className="p-4 space-y-4" style={{ background: "var(--bg-card)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Drag rows or use arrows. Lower items appear first in reseller lists and line pickers.
          </p>
          <ul className="space-y-1">
            {bouquets.map((b, i) => (
              <li
                key={b.id}
                draggable
                onDragStart={() => setDragId(b.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnRow(b.id);
                }}
                className="flex items-center gap-2 rounded border px-3 py-2 cursor-grab active:cursor-grabbing"
                style={{
                  borderColor: "var(--border)",
                  background: dragId === b.id ? "rgba(0,192,239,0.15)" : "transparent",
                }}
              >
                <span className="flex-1">{b.name}</span>
                <button type="button" className="text-xs cursor-pointer px-2" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="text-xs cursor-pointer px-2" onClick={() => move(i, 1)}>
                  ↓
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={save} className="btn-positive rounded px-6 py-2.5 font-medium cursor-pointer">
            Save order
          </button>
          {msg && <p className="text-sm" style={{ color: "var(--success)" }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
