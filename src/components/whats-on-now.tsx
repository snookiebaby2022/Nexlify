"use client";

import { useEffect, useState } from "react";

type Item = { id: string; catalogName: string; nowPlaying: string; category: string; country: string };

export function WhatsOnNow({ apiUrl = "/api/admin/whats-on" }: { apiUrl?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [at, setAt] = useState("");

  useEffect(() => {
    function load() {
      fetch(apiUrl, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          setItems(Array.isArray(d.items) ? d.items : []);
          setAt(d.at ?? "");
        })
        .catch(() => setItems([]));
    }
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [apiUrl]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">What’s on now</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Watch-party view for resellers. Catalog names stay fixed — fixture / programme titles show underneath.
          {at ? ` Updated ${new Date(at).toLocaleTimeString()}.` : ""}
        </p>
      </div>
      {!items.length ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No current programmes yet. EPG sync fills this every few minutes.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                {it.country || "Live"} · {it.category}
              </p>
              <p className="font-semibold text-sm mt-1">{it.catalogName}</p>
              <p className="text-sm mt-1" style={{ color: "var(--accent)" }}>
                {it.nowPlaying}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
