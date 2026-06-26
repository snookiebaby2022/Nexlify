"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { IpWithFlag } from "@/components/ip-with-flag";

export default function RtmpIpsPage() {
  const [items, setItems] = useState<
    { id: string; name: string; host: string; port: number; appName: string | null; isActive: boolean; notes: string | null; updatedAt: string }[]
  >([]);
  const [form, setForm] = useState({ name: "", host: "", port: 1935, appName: "live", notes: "" });

  function load() {
    fetch("/api/admin/rtmp-ips").then((r) => r.json()).then((d) => setItems(d.items));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/rtmp-ips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", host: "", port: 1935, appName: "live", notes: "" });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete RTMP endpoint?")) return;
    await fetch(`/api/admin/rtmp-ips?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">RTMP IPs</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Publish / ingest RTMP endpoints for live streams.
      </p>
      <form onSubmit={add} className="rounded-lg border p-4 grid md:grid-cols-3 gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <input placeholder="Name" required className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Host / IP" required className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        <input type="number" placeholder="Port" className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) })} />
        <input placeholder="App name" className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} />
        <input placeholder="Notes" className="rounded border px-3 py-2 bg-transparent md:col-span-2" style={{ borderColor: "var(--border)" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button type="submit" className="rounded py-2 cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>Add RTMP</button>
      </form>
      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">URL</th>
              <th className="text-left p-3">App</th>
              <th className="text-left p-3">Notes</th>
              <th className="text-left p-3">Updated</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{r.name}</td>
                <td className="p-3">
                  <IpWithFlag ip={`rtmp://${r.host}:${r.port}`} />
                </td>
                <td className="p-3">{r.appName ?? "live"}</td>
                <td className="p-3" style={{ color: "var(--muted)" }}>{r.notes ?? "—"}</td>
                <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(r.updatedAt)}</td>
                <td className="p-3">
                  <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--danger)" }} onClick={() => remove(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
