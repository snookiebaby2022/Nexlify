"use client";



import { useEffect, useState } from "react";

import Link from "next/link";



type StreamRow = {

  id: string;

  name: string;

  server: string;

  lastProbeOk: boolean | null;

  lastProbeError: string | null;

  connections: number;

  hasBackup: boolean;

  logsUrl: string;

};



export default function StreamHealthPage() {

  const [rows, setRows] = useState<StreamRow[]>([]);

  const [summary, setSummary] = useState({ total: 0, uptimePct: 100 });

  const [fixMsg, setFixMsg] = useState<Record<string, string>>({});



  function load() {

    fetch("/api/admin/stream-health")

      .then((r) => r.json())

      .then((d) => {

        setRows(d.streams ?? []);

        setSummary(d.summary ?? { total: 0, uptimePct: 100 });

      });

  }



  useEffect(() => {

    load();

  }, []);



  async function fixStream(id: string) {

    setFixMsg((m) => ({ ...m, [id]: "Fixing…" }));

    const res = await fetch("/api/admin/stream-health", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ streamId: id }),

    });

    const j = await res.json();

    setFixMsg((m) => ({ ...m, [id]: j.message ?? j.error ?? (res.ok ? "Done" : "Failed") }));

    load();

  }



  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-2xl font-semibold">Stream health</h1>

        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>

          Probe status, uptime estimate, live connections, logs, and one-click error fix per channel.

        </p>

      </div>



      <div className="grid sm:grid-cols-2 gap-4 max-w-md">

        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Live streams</div>

          <div className="text-2xl font-semibold">{summary.total}</div>

        </div>

        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Probe uptime</div>

          <div className="text-2xl font-semibold">{summary.uptimePct}%</div>

        </div>

      </div>



      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>

        <table className="w-full text-sm">

          <thead>

            <tr style={{ background: "var(--bg-card)" }}>

              <th className="text-left p-3">Channel</th>

              <th className="text-left p-3">Server</th>

              <th className="text-left p-3">Health</th>

              <th className="text-right p-3">Clients</th>

              <th className="text-left p-3">Backup</th>

              <th className="text-left p-3">Actions</th>

            </tr>

          </thead>

          <tbody>

            {rows.map((s) => (

              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>

                <td className="p-3">

                  <Link href={`/admin/stream?id=${s.id}`} className="underline">

                    {s.name}

                  </Link>

                </td>

                <td className="p-3">{s.server}</td>

                <td className="p-3">

                  <span style={{ color: s.lastProbeOk === false ? "var(--danger)" : "#4ade80" }}>

                    {s.lastProbeOk === false ? s.lastProbeError ?? "Failed" : "OK"}

                  </span>

                </td>

                <td className="p-3 text-right tabular-nums">{s.connections}</td>

                <td className="p-3">{s.hasBackup ? "Yes" : "—"}</td>

                <td className="p-3 space-x-2">

                  <Link href={s.logsUrl} className="text-xs underline" style={{ color: "var(--accent)" }}>

                    Logs

                  </Link>

                  {s.lastProbeOk === false && (

                    <button

                      type="button"

                      className="text-xs underline cursor-pointer"

                      style={{ color: "var(--accent)" }}

                      onClick={() => fixStream(s.id)}

                    >

                      Fix

                    </button>

                  )}

                  {fixMsg[s.id] && (

                    <span className="text-xs" style={{ color: "var(--muted)" }}>

                      {fixMsg[s.id]}

                    </span>

                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}

