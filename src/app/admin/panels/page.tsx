"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Panel = {
  id: string;
  url: string;
  domain: string | null;
  ip: string | null;
  version: string;
  isActive: boolean;
  autoUpdateEnabled: boolean;
  lastSeenAt: string;
  registeredAt: string;
  lastError: string | null;
};

type BroadcastResult = {
  url: string;
  ok: boolean;
  started?: boolean;
  reason?: string;
  error?: string;
};

export default function PanelsPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<BroadcastResult[] | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/panels");
      const data = await res.json();
      setPanels(data.panels || []);
    } catch (e) {
      setMsg("Failed to load panels: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleAutoUpdate(id: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/panels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, autoUpdateEnabled: !current }),
      });
      if (res.ok) {
        setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, autoUpdateEnabled: !current } : p)));
      }
    } catch (e) {
      setMsg("Update failed: " + String(e));
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/panels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !current }),
      });
      if (res.ok) {
        setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !current } : p)));
      }
    } catch (e) {
      setMsg("Update failed: " + String(e));
    }
  }

  async function removePanel(id: string) {
    if (!confirm("Remove this panel from the registry?")) return;
    try {
      const res = await fetch(`/api/admin/panels?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPanels((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (e) {
      setMsg("Delete failed: " + String(e));
    }
  }

  async function broadcastUpdate() {
    if (!confirm("Trigger update on ALL active panels with auto-update enabled?")) return;
    setBroadcasting(true);
    setBroadcastResults(null);
    setMsg("");
    try {
      const res = await fetch("/api/admin/panels/broadcast-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        setBroadcastResults(data.results || []);
        setMsg(`Broadcast complete: ${data.success} succeeded, ${data.failed} failed out of ${data.total}`);
        load();
      } else {
        setMsg("Broadcast failed: " + (data.error || "unknown"));
      }
    } catch (e) {
      setMsg("Broadcast error: " + String(e));
    } finally {
      setBroadcasting(false);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
            Registered Panels
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Customer panels that have registered for push updates and heartbeat monitoring.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void load()}
            className="text-sm px-3 py-2 rounded-md font-medium border cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Refresh
          </button>
          <button
            onClick={() => void broadcastUpdate()}
            disabled={broadcasting}
            className="text-sm px-3 py-2 rounded-md font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "#00c0ef", color: "#fff" }}
          >
            {broadcasting ? "Broadcasting…" : "Broadcast Update"}
          </button>
        </div>
      </div>

      {msg && (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          {msg}
        </p>
      )}

      {broadcastResults && (
        <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold">Broadcast Results</h3>
          <div className="max-h-60 overflow-auto text-xs space-y-1">
            {broadcastResults.map((r) => (
              <div key={r.url} className="flex items-start gap-2">
                <span className={r.ok ? "text-green-400" : "text-red-400"}>{r.ok ? "✓" : "✗"}</span>
                <div className="flex-1">
                  <span className="font-mono">{r.url}</span>
                  {r.started && <span className="text-green-400 ml-2">started</span>}
                  {r.reason && <span className="text-slate-400 ml-2">{r.reason}</span>}
                  {r.error && <span className="text-red-400 ml-2">{r.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
      ) : panels.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No panels registered yet. Panels will auto-register when they connect to the vendor.
        </p>
      ) : (
        <div className="overflow-auto rounded border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(0,192,239,0.08)" }}>
                <th className="text-left p-2">URL</th>
                <th className="text-left p-2">Version</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Last Seen</th>
                <th className="text-left p-2">Auto-Update</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {panels.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2">
                    <div className="font-mono text-xs">{p.url}</div>
                    {p.domain && <div className="text-xs text-slate-400">{p.domain}</div>}
                    {p.ip && <div className="text-xs text-slate-400">IP: {p.ip}</div>}
                    {p.lastError && <div className="text-xs text-red-400 mt-1">{p.lastError}</div>}
                  </td>
                  <td className="p-2">
                    <span className="text-xs font-mono">{p.version}</span>
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleActive(p.id, p.isActive)}
                      className="text-xs px-2 py-1 rounded cursor-pointer border"
                      style={{
                        borderColor: "var(--border)",
                        background: p.isActive ? "rgba(0,166,90,0.2)" : "transparent",
                        color: p.isActive ? "#00a65a" : "var(--muted)",
                      }}
                    >
                      {p.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="p-2 text-xs" style={{ color: "var(--muted)" }}>
                    {timeAgo(p.lastSeenAt)}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleAutoUpdate(p.id, p.autoUpdateEnabled)}
                      className="text-xs px-2 py-1 rounded cursor-pointer border"
                      style={{
                        borderColor: "var(--border)",
                        background: p.autoUpdateEnabled ? "rgba(0,192,239,0.2)" : "transparent",
                        color: p.autoUpdateEnabled ? "#00c0ef" : "var(--muted)",
                      }}
                    >
                      {p.autoUpdateEnabled ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={p.url}
                      target="_blank"
                      className="text-xs px-2 py-1 rounded border mr-1"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => removePanel(p.id)}
                      className="text-xs px-2 py-1 rounded text-red-400 cursor-pointer border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
