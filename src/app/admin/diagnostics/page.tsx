"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";

type ServerRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  healthStatus: string | null;
  healthMessage: string | null;
  isPanel: boolean;
  portOpen: boolean;
};

type Snapshot = {
  servers: ServerRow[];
  lastRecover: { status: string; message: string | null; createdAt: string; durationMs: number | null } | null;
  lastProbeJob: { job: string; status: string; message: string | null; createdAt: string } | null;
  notes: string[];
};

export default function DiagnosticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"load" | "recover" | "probe" | null>("load");
  const [actionMsg, setActionMsg] = useState("");
  const [streamId, setStreamId] = useState("");

  const load = useCallback(() => {
    setBusy("load");
    setError("");
    fetch("/api/admin/diagnostics")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Failed to load diagnostics");
        setData(body);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load diagnostics"))
      .finally(() => setBusy(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recover() {
    setBusy("recover");
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recover-lbs" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Recover failed");
      const r = body.result as { checked: number; recovered: number; stillDown: number };
      setActionMsg(`Checked ${r.checked}, recovered ${r.recovered}, still down ${r.stillDown}.`);
      load();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Recover failed");
    } finally {
      setBusy(null);
    }
  }

  async function probe() {
    const id = streamId.trim();
    if (!id) {
      setActionMsg("Paste a stream id from Manage Streams first.");
      return;
    }
    setBusy("probe");
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId: id, fast: false }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Probe failed");
      const status = String(body.probe?.status ?? "unknown");
      const message = String(body.probe?.message ?? "");
      const name = String(body.stream?.name ?? id);
      const ok = status === "online" || status === "degraded";
      setActionMsg(ok ? `${name}: ${status}` : `${name}: ${status}${message ? ` — ${message}` : ""}`);
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <FormPageShell title="Diagnostics" manageHref="/admin/dashboard" manageLabel="Dashboard">
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Safe checks and recoveries. This does not restream live on Main, kill port 8080, or start the panel
        IPTV edge.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link className="text-sm underline" href="/admin/content/streams?status=offline" style={{ color: "var(--accent)" }}>
          Failed probes
        </Link>
        <Link className="text-sm underline" href="/admin/streaming/health" style={{ color: "var(--accent)" }}>
          Streaming health
        </Link>
        <Link className="text-sm underline" href="/admin/connections" style={{ color: "var(--accent)" }}>
          Live connections
        </Link>
        <Link className="text-sm underline" href="/admin/servers" style={{ color: "var(--accent)" }}>
          Servers
        </Link>
        <Link className="text-sm underline" href="/admin/content/streams" style={{ color: "var(--accent)" }}>
          Manage streams
        </Link>
      </div>

      {error ? (
        <p className="text-sm mb-4" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          type="button"
          className="btn-positive rounded px-4 py-2 text-sm disabled:opacity-50"
          disabled={busy !== null}
          onClick={load}
        >
          {busy === "load" ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm border disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
          disabled={busy !== null}
          onClick={() => void recover()}
        >
          {busy === "recover" ? "Recovering…" : "Recover load balancers"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end mb-6">
        <label className="text-sm flex-1 min-w-[16rem]">
          <span className="block mb-1" style={{ color: "var(--muted)" }}>
            Probe one stream (only if playback is failing)
          </span>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            placeholder="Stream id"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm border disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
          disabled={busy !== null}
          onClick={() => void probe()}
        >
          {busy === "probe" ? "Probing…" : "Probe stream"}
        </button>
      </div>

      {actionMsg ? (
        <p className="text-sm mb-4" style={{ color: "var(--text)" }}>
          {actionMsg}
        </p>
      ) : null}

      {data?.lastRecover ? (
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Last reboot recover: {data.lastRecover.status} — {data.lastRecover.message ?? "—"} (
          {new Date(data.lastRecover.createdAt).toLocaleString()})
        </p>
      ) : null}
      {data?.lastProbeJob ? (
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Last probe job ({data.lastProbeJob.job}): {data.lastProbeJob.message ?? data.lastProbeJob.status}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className="text-left p-2">Server</th>
              <th className="text-left p-2">Host</th>
              <th className="text-left p-2">Port</th>
              <th className="text-left p-2">TCP</th>
              <th className="text-left p-2">Health</th>
            </tr>
          </thead>
          <tbody>
            {(data?.servers ?? []).map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-2">
                  {s.name}
                  {s.isPanel ? " (Main)" : ""}
                </td>
                <td className="p-2 font-mono text-xs">{s.host}</td>
                <td className="p-2">{s.port}</td>
                <td className="p-2" style={{ color: s.portOpen ? "var(--success)" : "var(--danger)" }}>
                  {s.portOpen ? "open" : "closed"}
                </td>
                <td className="p-2">
                  {s.healthStatus ?? "—"}
                  {s.healthMessage ? ` — ${s.healthMessage}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 text-xs space-y-1" style={{ color: "var(--muted)" }}>
        {(data?.notes ?? []).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </FormPageShell>
  );
}
