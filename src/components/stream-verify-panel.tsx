"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUptime } from "@/lib/stream-live-stats";
import { formatDateTime } from "@/lib/format";

type Tab = "servers" | "sources" | "errors";

type ProcessRow = {
  id: string;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  lastSeenAt: string;
  stream: { id: string; name: string } | null;
  server: { id: string; name: string; host?: string };
};

type SourceRow = {
  id: string;
  name: string;
  streamUrl: string;
  server?: { name: string } | null;
  liveStats?: {
    displayStatus: string;
    uptimeSec?: number;
    bitrateKbps?: number;
    resolution?: string;
    videoCodec?: string;
    audioCodec?: string;
    fps?: number;
    speed?: string;
    clients?: number;
  } | null;
};

type ErrorRow = {
  id: string;
  name: string;
  lastProbeError: string | null;
  server?: { name: string } | null;
};

export function StreamVerifyPanel() {
  const [tab, setTab] = useState<Tab>("servers");
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);

  const load = useCallback(() => {
    fetch("/api/admin/processes")
      .then((r) => r.json())
      .then((d) => setProcesses(d.processes ?? []));
    fetch("/api/admin/streams?pageSize=50&withStats=1&type=LIVE")
      .then((r) => r.json())
      .then((d) => setSources(d.streams ?? []));
    fetch("/api/admin/stream-errors")
      .then((r) => r.json())
      .then((d) => {
        const probe = (d.probeFails ?? []) as ErrorRow[];
        const proc = (d.processErrors ?? []) as ProcessRow[];
        setErrors([
          ...probe,
          ...proc.map((p) => ({
            id: p.stream?.id ?? p.id,
            name: p.stream?.name ?? "Process error",
            lastProbeError: p.errorMessage,
            server: p.server,
          })),
        ]);
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "servers", label: "Active Servers" },
    { id: "sources", label: "Stream Sources" },
    { id: "errors", label: "Recent Errors" },
  ];

  return (
    <section className="xui-verify-panel">
      <div className="xui-verify-panel-header">
        <h2 className="xui-verify-panel-title">Verify the Stream</h2>
        <nav className="xui-verify-tabs" aria-label="Stream verification">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`xui-verify-tab ${tab === t.id ? "xui-verify-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="xui-verify-table-wrap">
        {tab === "servers" && (
          <table className="xui-verify-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Clients</th>
                <th>Uptime</th>
                <th>Actions</th>
                <th>Stream info</th>
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="xui-verify-empty">
                    No active ffmpeg processes — direct/HLS channels relay through the panel without a process here.
                  </td>
                </tr>
              ) : (
                processes.map((p) => {
                  const uptimeSec =
                    p.startedAt && p.status === "running"
                      ? Math.max(0, Math.floor((Date.now() - new Date(p.startedAt).getTime()) / 1000))
                      : 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.server.name}</strong>
                        <div className="xui-verify-sub">{p.stream?.name ?? "—"}</div>
                      </td>
                      <td>
                        <span className="xui-verify-badge">0</span>
                      </td>
                      <td>
                        <span className={`xui-verify-uptime xui-verify-uptime--${p.status === "running" ? "ok" : "err"}`}>
                          {p.status === "running" ? formatUptime(uptimeSec) : p.status}
                        </span>
                      </td>
                      <td className="xui-verify-actions">
                        {p.stream && (
                          <Link href={`/admin/servers/streams?edit=${p.stream.id}`} className="xui-verify-link">
                            Edit
                          </Link>
                        )}
                      </td>
                      <td className="xui-verify-info-grid">
                        <span>Status: {p.status}</span>
                        {p.errorMessage && <span className="text-red-400">{p.errorMessage}</span>}
                        <span>Last seen: {formatDateTime(p.lastSeenAt)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {tab === "sources" && (
          <table className="xui-verify-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Clients</th>
                <th>Uptime</th>
                <th>Actions</th>
                <th>Stream info</th>
              </tr>
            </thead>
            <tbody>
              {sources.slice(0, 30).map((s) => {
                const st = s.liveStats;
                const uptimeSec = st?.uptimeSec ?? 0;
                const ok = st?.displayStatus === "Online" || st?.displayStatus === "Direct";
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.server?.name ?? "Main Server"}</strong>
                      <div className="xui-verify-sub truncate max-w-[220px]" title={s.streamUrl}>
                        {s.name}
                      </div>
                    </td>
                    <td>
                      <span className="xui-verify-badge">{st?.clients ?? 0}</span>
                    </td>
                    <td>
                      <span className={`xui-verify-uptime xui-verify-uptime--${ok ? "ok" : "err"}`}>
                        {ok && uptimeSec ? formatUptime(uptimeSec) : (st?.displayStatus ?? "—")}
                      </span>
                    </td>
                    <td className="xui-verify-actions">
                      <Link href={`/admin/servers/streams?edit=${s.id}`} className="xui-verify-link">
                        Edit
                      </Link>
                    </td>
                    <td className="xui-verify-info-grid">
                      {st?.bitrateKbps != null && <span>Bitrate: {st.bitrateKbps.toLocaleString()} Kbps</span>}
                      {st?.resolution && <span>Resolution: {st.resolution}</span>}
                      {st?.videoCodec && <span>Video: {st.videoCodec}</span>}
                      {st?.audioCodec && <span>Audio: {st.audioCodec}</span>}
                      {st?.fps != null && <span>{st.fps} FPS</span>}
                      {!st?.bitrateKbps && !st?.resolution && <span>{st?.displayStatus ?? "—"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "errors" && (
          <table className="xui-verify-table">
            <thead>
              <tr>
                <th>Stream</th>
                <th>Server</th>
                <th>Error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {errors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="xui-verify-empty">
                    No recent stream errors.
                  </td>
                </tr>
              ) : (
                errors.slice(0, 40).map((e) => (
                  <tr key={`${e.id}-${e.name}`}>
                    <td>{e.name}</td>
                    <td>{e.server?.name ?? "—"}</td>
                    <td className="text-red-400 text-sm">{e.lastProbeError ?? "Unknown"}</td>
                    <td>
                      <Link href={`/admin/servers/streams?edit=${e.id}`} className="xui-verify-link">
                        Fix
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
