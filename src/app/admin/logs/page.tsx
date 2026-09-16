"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const TABS = [
  { id: "panel", label: "Panel login", href: "/admin/login_logs", action: "login", clear: "login" },
  { id: "audit", label: "Panel audit", href: "/admin/management/logs", action: "", clear: "" },
  { id: "stream", label: "Stream logs", href: "/admin/streams/logs", action: "stream", clear: "stream" },
  { id: "errors", label: "Stream errors", href: "/admin/stream_errors", action: "stream_error", clear: "stream_error" },
  { id: "clients", label: "Client logs", href: "/admin/client_logs", action: "", clear: "" },
  { id: "restream", label: "Restream", href: "/admin/restream_logs", action: "restream", clear: "restream" },
] as const;

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId?: string | null;
  createdAt: string;
  who?: string;
  streamName?: string | null;
  user?: { username: string } | null;
  line?: { username: string } | null;
};

export default function LogsHubPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("panel");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "40" });
    if (current.action) params.set("action", current.action);
    fetch(`/api/admin/logs?${params}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.logs) ? d.logs : []))
      .finally(() => setLoading(false));
  }, [current.action]);

  useEffect(() => {
    load();
  }, [load]);

  async function clearCurrent() {
    if (!confirm(`Clear ${current.label.toLowerCase()} entries? This cannot be undone.`)) return;
    setBusy("clear");
    const params = new URLSearchParams();
    if (current.clear) params.set("action", current.clear);
    await fetch(`/api/admin/logs?${params}`, { method: "DELETE" });
    setBusy("");
    setMsg(`Cleared ${current.label.toLowerCase()}.`);
    load();
  }

  async function clearExpiredLines() {
    if (!confirm("Delete every expired line (including expired trials)? This cannot be undone.")) return;
    setBusy("expired");
    const res = await fetch("/api/admin/logs/clear-expired-lines", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? `Deleted ${data.deleted ?? 0} expired line(s).` : data.error ?? "Failed");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          One place for panel login, stream errors, and cleanup. Open a tab for the full page.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-full text-sm ${tab === t.id ? "font-semibold" : ""}`}
            style={{
              background: tab === t.id ? "var(--accent)" : "var(--bg-card)",
              color: tab === t.id ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={current.href} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          Open full {current.label.toLowerCase()}
        </Link>
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
          disabled={Boolean(busy)}
          onClick={() => void clearCurrent()}
        >
          {busy === "clear" ? "Clearing…" : `Clear ${current.label.toLowerCase()}`}
        </button>
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "rgba(239,68,68,0.4)", color: "#f87171" }}
          disabled={Boolean(busy)}
          onClick={() => void clearExpiredLines()}
        >
          {busy === "expired" ? "Deleting…" : "Clear expired lines"}
        </button>
        <button type="button" className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: "var(--border)" }} onClick={load}>
          Refresh
        </button>
      </div>

      {msg ? <p className="text-sm">{msg}</p> : null}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-2">When</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Who</th>
              <th className="text-left p-2">Entity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={4} style={{ color: "var(--muted)" }}>
                  No rows in this tab.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2">{row.who ?? row.user?.username ?? row.line?.username ?? "—"}</td>
                  <td className="p-2">
                    {row.entity ?? "—"}
                    {row.streamName ? (
                      <span className="block text-xs" style={{ color: "var(--muted)" }}>
                        {row.streamName}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
