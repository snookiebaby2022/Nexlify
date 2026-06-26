"use client";

import { useEffect, useState } from "react";

type Stream = { id: string; name: string; type: string; isActive: boolean };

export default function StreamsMassEditPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [action, setAction] = useState("disable");
  const [categoryId, setCategoryId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/streams").then((r) => r.json()).then((d) => setStreams(d.streams));
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories));
  }, []);

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  async function apply() {
    if (!selected.size) return;
    const res = await fetch("/api/admin/streams/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [...selected],
        action,
        categoryId: action === "setCategory" ? categoryId || null : undefined,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Updated ${data.count} streams` : data.error);
    setSelected(new Set());
    fetch("/api/admin/streams").then((r) => r.json()).then((d) => setStreams(d.streams));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mass edit streams</h1>
      <div className="flex flex-wrap gap-3 items-end">
        <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="delete">Delete</option>
          <option value="setCategory">Set category</option>
        </select>
        {action === "setCategory" && (
          <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={apply} className="rounded px-4 py-2 text-sm cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>
          Apply to {selected.size} selected
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      <div className="rounded-lg border overflow-auto max-h-[60vh]" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10" />
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.type}</td>
                <td className="p-3">{s.isActive ? "Active" : "Off"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
