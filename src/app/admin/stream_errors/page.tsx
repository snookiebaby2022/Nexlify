"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

export default function StreamErrorsPage() {
  const [probeFails, setProbeFails] = useState<
    {
      id: string;
      name: string;
      type: string;
      lastProbeAt: string | null;
      lastProbeError: string | null;
      server: { name: string } | null;
      serverId?: string | null;
    }[]
  >([]);
  const [processErrors, setProcessErrors] = useState<
    {
      id: string;
      status: string;
      errorMessage: string | null;
      lastSeenAt: string;
      stream: { id: string; name: string } | null;
      server: { id: string; name: string };
    }[]
  >([]);
  const [fixMsg, setFixMsg] = useState<Record<string, string>>({});

  function load() {
    fetch("/api/admin/stream-errors")
      .then((r) => r.json())
      .then((d) => {
        setProbeFails(d.probeFails ?? []);
        setProcessErrors(d.processErrors ?? []);
      });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  async function probeStream(streamId: string) {
    setFixMsg((m) => ({ ...m, [`probe-${streamId}`]: "…" }));
    const res = await fetch("/api/admin/streams/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, fast: true }),
    });
    const data = await res.json();
    setFixMsg((m) => ({
      ...m,
      [`probe-${streamId}`]: res.ok
        ? data.probe?.status === "online"
          ? "Online"
          : data.probe?.message ?? "Failed"
        : data.error ?? "Error",
    }));
    load();
  }

  async function restartStream(streamId: string, serverId: string) {
    setFixMsg((m) => ({ ...m, [`restart-${streamId}`]: "…" }));
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart_stream", streamId }),
    });
    const data = await res.json();
    setFixMsg((m) => ({
      ...m,
      [`restart-${streamId}`]: res.ok ? (data.note ?? "Queued") : (data.error ?? "Failed"),
    }));
    load();
  }

  function fixButtons(streamId: string, serverId?: string | null) {
    return (
      <span key={`fix-${streamId}`} className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => probeStream(streamId)}
        >
          Probe
        </button>
        <Link
          href={`/admin/servers/streams?edit=${streamId}`}
          className="text-xs px-2 py-1 rounded border inline-block"
          style={{ borderColor: "var(--border)", color: "var(--accent)" }}
        >
          Edit
        </Link>
        {serverId && (
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => restartStream(streamId, serverId)}
          >
            Restart
          </button>
        )}
        {(fixMsg[`probe-${streamId}`] || fixMsg[`restart-${streamId}`]) && (
          <span className="text-[10px] w-full" style={{ color: "var(--muted)" }}>
            {fixMsg[`probe-${streamId}`] ?? fixMsg[`restart-${streamId}`]}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Stream errors</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Failed probes and agent process issues.{" "}
          <Link href="/admin/process_monitor" style={{ color: "var(--accent)" }}>
            Process monitor
          </Link>
          {" · "}
          <Link href="/admin/streams/logs" style={{ color: "var(--accent)" }}>
            Stream logs
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Probe failures</h2>
        {probeFails.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No probe failures right now. Run probes from Manage Streams to populate this list.
          </p>
        ) : (
        <DataTable
          headers={["Stream", "Server", "Last probe", "Error", "Fix"]}
          rows={probeFails.map((s) => [
            s.name,
            s.server?.name ?? "—",
            s.lastProbeAt ? formatDateTime(s.lastProbeAt) : "—",
            s.lastProbeError ?? "—",
            fixButtons(s.id, s.serverId),
          ])}
        />
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Process / agent issues</h2>
        {processErrors.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No agent process errors. Direct-source channels do not use ffmpeg agents — see{" "}
            <Link href="/admin/streams/logs" style={{ color: "var(--accent)" }}>
              Stream logs
            </Link>{" "}
            for live relay viewers and HLS remux errors.
          </p>
        ) : (
        <DataTable
          headers={["Stream", "Server", "Status", "Error", "Last seen", "Fix"]}
          rows={processErrors.map((p) => [
            p.stream?.name ?? "—",
            p.server.name,
            p.status,
            p.errorMessage ?? "—",
            formatDateTime(p.lastSeenAt),
            p.stream ? fixButtons(p.stream.id, p.server.id) : "—",
          ])}
        />
        )}
      </section>
    </div>
  );
}
