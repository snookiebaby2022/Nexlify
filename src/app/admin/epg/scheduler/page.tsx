"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type EpgSource = {
  id: string;
  name: string;
  url: string;
  lastSyncAt: string | null;
  isActive: boolean;
};

export default function EpgSchedulerPage() {
  const [sources, setSources] = useState<EpgSource[]>([]);
  const [cronMins, setCronMins] = useState(60);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/epg")
      .then((r) => r.json())
      .then((d) => setSources(Array.isArray(d.sources) ? d.sources : []));
    fetch("/api/admin/settings?group=cron")
      .then((r) => r.json())
      .then((d) => {
        const cron = String(d?.settings?.epgSyncCron ?? "0 * * * *");
        setCronMins(cron.includes("*") ? 60 : parseInt(cron, 10) || 60);
      });
  }, []);

  async function saveCron() {
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "cron", settings: { epgSyncCron: `*/${cronMins} * * * *` } }),
    });
    if (!res.ok) {
      setMsg("Failed to save cron interval");
      return;
    }
    setMsg("EPG sync interval saved.");
  }

  async function syncNow(id: string) {
    await fetch(`/api/admin/epg/${id}`, { method: "POST" });
    const r = await fetch("/api/admin/epg");
    const d = await r.json();
    setSources(Array.isArray(d.sources) ? d.sources : []);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">EPG grabber scheduler</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          XUI-style per-source grab status with global cron interval. Requires nexlify-cron.
        </p>
        <p className="text-sm mt-2">
          <Link href="/admin/epg/sources" className="underline" style={{ color: "var(--accent)" }}>
            Manage EPG sources
          </Link>
          {" · "}
          <Link href="/admin/settings/cron" className="underline" style={{ color: "var(--accent)" }}>
            All cron jobs
          </Link>
        </p>
      </div>

      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold">Global sync interval</h2>
        <label className="flex items-center gap-3 text-sm">
          Run EPG sync every
          <input
            type="number"
            min={5}
            className="w-24 rounded border px-2 py-1 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={cronMins}
            onChange={(e) => setCronMins(parseInt(e.target.value, 10) || 60)}
          />
          minutes
        </label>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => saveCron()}
        >
          Save interval
        </button>
        {msg ? <p className="text-xs">{msg}</p> : null}
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Last grab</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.isActive ? "Active" : "Paused"}</td>
                <td className="p-3">{s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "Never"}</td>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-xs underline cursor-pointer"
                    style={{ color: "var(--accent)" }}
                    onClick={() => syncNow(s.id)}
                  >
                    Grab now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
