"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Cpu,
  Play,
  RefreshCw,
  Server,
  Tv,
  Zap,
} from "lucide-react";

type HealthSnapshot = {
  servers: {
    id: string;
    name: string;
    host: string;
    online: boolean;
    hasAgent: boolean;
    agentLastSeen: string | null;
    maxClients: number;
  }[];
  onlineServers: number;
  streamCounts: { live: number; movie: number; series: number; radio: number };
  streamProbes: { ok: number; fail: number; unknown: number; total: number; healthy: boolean };
  bouquets: {
    id: string;
    name: string;
    lineCount: number;
    counts: { streams: number; movies: number; series: number; stations: number; total: number };
  }[];
  emptyBouquets: string[];
  activeLines: number;
  antiFreeze: {
    antiFreezeEnabled: boolean;
    fastZapEnabled: boolean;
    zapPrefetchNeighbors: number;
    zapPrefetchOnLiveHit: boolean;
    playbackUrlCacheTtlSec: number;
  };
  redis: { connected: boolean; configured: boolean; mode: string };
  optimization: {
    hardware: { tier: string; label: string; cpuCores: number; ramGb: number; hostname: string };
    recommendedTier: string;
    recommendedLabel: string;
    notes: string[];
  };
  checklist: { id: string; label: string; ok: boolean; href: string; hint: string }[];
  readyScore: number;
  readyTotal: number;
  streamingReady: boolean;
  buffering: {
    risk: "healthy" | "watch" | "critical";
    label: string;
    liveConnections: number;
    stallSessions: number;
    atRiskServers: { id: string; name: string; risk: string; label: string; headroomPct: number }[];
    sourceDiagnostics: { id: string; name: string; lastProbeError: string | null; sources: { url: string; state: string; failures: number; successes: number; latencyMs: number | null; bitrateKbps: number | null; lastError: string | null }[] }[];
  };
};

export default function StreamingHealthPage() {
  const [data, setData] = useState<HealthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [optimizeBusy, setOptimizeBusy] = useState(false);
  const [setupMsg, setSetupMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/streaming-health")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runSetup() {
    if (!confirm("Seed demo server, streams, full bouquet, demo line, and enable anti-freeze?")) return;
    setBusy(true);
    setSetupMsg("");
    const res = await fetch("/api/admin/streaming-setup", { method: "POST" });
    setBusy(false);
    const body = await res.json();
    if (!res.ok) {
      setSetupMsg(body.error ?? "Setup failed");
      return;
    }
    setSetupMsg(body.message ?? "Streaming setup complete.");
    load();
  }

  async function runOptimize() {
    if (!confirm("Apply VPS-optimized streaming settings for this server? This updates streams, cache, and pushes agent config.")) return;
    setOptimizeBusy(true);
    setSetupMsg("");
    const res = await fetch("/api/admin/streaming-optimize", { method: "POST" });
    setOptimizeBusy(false);
    const body = await res.json();
    if (!res.ok) {
      setSetupMsg(body.error ?? "Optimization failed");
      return;
    }
    setSetupMsg(body.message + (body.steps?.length ? ` — ${body.steps.join("; ")}` : ""));
    load();
  }

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading streaming health…</p>;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Operations</p>
          <h1 className="text-lg font-semibold text-white">Streaming Health</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            type="button"
            disabled={optimizeBusy}
            onClick={() => void runOptimize()}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-white/15 text-white hover:bg-white/25 disabled:opacity-60"
          >
            <Cpu size={14} />
            Auto-optimize VPS
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSetup()}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-white/20 text-white hover:bg-white/30 disabled:opacity-60"
          >
            <Zap size={14} />
            One-click setup
          </button>
        </div>
      </div>

      {setupMsg && (
        <p className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>
          {setupMsg}
        </p>
      )}

      <div
        className="rounded-lg border p-4 flex flex-wrap items-center gap-4"
        style={{
          borderColor: data.streamingReady ? "#22c55e" : "var(--border)",
          background: data.streamingReady ? "rgba(34,197,94,0.08)" : "var(--bg-card)",
        }}
      >
        <div className="text-3xl font-bold tabular-nums" style={{ color: data.streamingReady ? "#22c55e" : "#00c0ef" }}>
          {data.readyScore}/{data.readyTotal}
        </div>
        <div>
          <p className="font-semibold">{data.streamingReady ? "Streaming ready for customers" : "Setup incomplete"}</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Anti-Freeze, Redis Fast Zap, and neighbour prefetch should all show green before going live.
          </p>
        </div>
      </div>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{
          borderColor: data.buffering.risk === "critical" ? "#ef4444" : data.buffering.risk === "watch" ? "#f59e0b" : "#22c55e",
          background: "var(--bg-card)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Buffering risk</h2>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {data.buffering.liveConnections} active sessions · {data.buffering.stallSessions} with stalls
              (0 is normal; 1–4 is usually a zap; 5+ on a session means buffering)
            </p>
          </div>
          <strong className={data.buffering.risk === "critical" ? "text-red-400" : data.buffering.risk === "watch" ? "text-amber-400" : "text-green-400"}>
            {data.buffering.label}
          </strong>
        </div>
        {data.buffering.sourceDiagnostics.length > 0 && (
          <div className="border-t pt-3 space-y-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold">Source diagnostics</p>
            {data.buffering.sourceDiagnostics.map((stream) => (
              <div key={stream.id} className="text-xs">
                <Link className="underline" href={`/admin/stream?id=${stream.id}`} style={{ color: "var(--accent)" }}>{stream.name}</Link>
                <span style={{ color: "var(--muted)" }}>{stream.lastProbeError ? ` — ${stream.lastProbeError}` : ""}</span>
                <ul className="ml-3 mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
                  {stream.sources.map((source) => (
                    <li key={source.url} className={source.state === "open" ? "text-red-400" : source.state === "half_open" ? "text-amber-400" : ""}>
                      {source.state.toUpperCase()} · {source.failures} failures · {source.latencyMs != null ? `${source.latencyMs}ms` : "latency —"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {data.buffering.atRiskServers.length > 0 && (
          <ul className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
            {data.buffering.atRiskServers.map((server) => (
              <li key={server.id}>
                <Link className="underline" href={`/admin/servers/${server.id}`} style={{ color: "var(--accent)" }}>{server.name}</Link>
                {` — ${server.label}, ${server.headroomPct}% egress headroom`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Cpu size={16} style={{ color: "var(--accent)" }} />
          VPS / dedicated optimization
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Detected <strong>{data.optimization.hardware.cpuCores} CPU</strong>,{" "}
          <strong>{data.optimization.hardware.ramGb} GB RAM</strong> on{" "}
          <code className="text-xs">{data.optimization.hardware.hostname}</code> — recommended profile:{" "}
          <strong>{data.optimization.recommendedLabel}</strong>
        </p>
        <ul className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
          {data.optimization.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Anti-Freeze</p>
          <p className={data.antiFreeze.antiFreezeEnabled ? "text-green-400 font-medium" : "text-amber-400"}>
            {data.antiFreeze.antiFreezeEnabled ? "Active" : "Disabled"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Redis Fast Zap</p>
          <p className={data.redis.connected || !data.redis.configured ? "text-green-400 font-medium" : "text-red-400"}>
            {data.antiFreeze.fastZapEnabled
              ? data.redis.configured
                ? data.redis.connected
                  ? `Connected (${data.redis.mode})`
                  : "Unreachable"
                : "In-memory fallback"
              : "Disabled"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Neighbour prefetch</p>
          <p className={data.antiFreeze.zapPrefetchOnLiveHit && data.antiFreeze.zapPrefetchNeighbors > 0 ? "text-green-400 font-medium" : "text-amber-400"}>
            {data.antiFreeze.zapPrefetchOnLiveHit
              ? `×${data.antiFreeze.zapPrefetchNeighbors} channels`
              : "Off"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60 mb-1">URL cache TTL</p>
          <p>{data.antiFreeze.playbackUrlCacheTtlSec}s</p>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.checklist.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-lg border p-4 flex gap-3 hover:bg-white/[0.03] transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            {item.ok ? (
              <CheckCircle2 className="shrink-0 text-green-400" size={22} />
            ) : (
              <Circle className="shrink-0 text-amber-400" size={22} />
            )}
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {item.hint}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Server size={16} style={{ color: "var(--accent)" }} />
            Streaming servers
          </h2>
          {data.servers.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No servers —{" "}
              <Link href="/admin/servers/add" className="underline" style={{ color: "var(--accent)" }}>
                add one
              </Link>
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.servers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    {s.name}{" "}
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      ({s.host})
                    </span>
                  </span>
                  <span className={`text-xs font-medium ${s.online ? "text-green-400" : "text-red-400"}`}>
                    {s.online ? "ONLINE" : s.hasAgent ? "OFFLINE" : "NO AGENT"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Tv size={16} style={{ color: "var(--accent)" }} />
            Catalog &amp; probes
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Live: <strong>{data.streamCounts.live}</strong></div>
            <div>Movies: <strong>{data.streamCounts.movie}</strong></div>
            <div>Series: <strong>{data.streamCounts.series}</strong></div>
            <div>Radio: <strong>{data.streamCounts.radio}</strong></div>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {data.activeLines} active line(s) · Probes:{" "}
            <span className={data.streamProbes.healthy ? "text-green-400" : "text-amber-400"}>
              {data.streamProbes.ok} OK
              {data.streamProbes.fail > 0 ? `, ${data.streamProbes.fail} failed` : ""}
            </span>
          </p>
          <Link href="/admin/streaming/engine" className="text-xs underline" style={{ color: "var(--accent)" }}>
            Open Streaming Engine →
          </Link>
        </section>
      </div>

      <section className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h2 className="text-sm font-semibold px-4 pt-4 pb-2">Bouquets</h2>
        <table className="w-full text-sm">
          <thead style={{ background: "rgba(0,192,239,0.1)" }}>
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-center">Streams</th>
              <th className="px-3 py-2 text-center">Movies</th>
              <th className="px-3 py-2 text-center">Series</th>
              <th className="px-3 py-2 text-center">Radio</th>
              <th className="px-3 py-2 text-center">Lines</th>
              <th className="px-3 py-2 text-right">Test</th>
            </tr>
          </thead>
          <tbody>
            {data.bouquets.map((b) => (
              <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 font-medium">
                  {b.name}
                  {b.counts.total === 0 && (
                    <span className="ml-2 text-[10px] uppercase text-amber-400">empty</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{b.counts.streams}</td>
                <td className="px-3 py-2 text-center tabular-nums">{b.counts.movies}</td>
                <td className="px-3 py-2 text-center tabular-nums">{b.counts.series}</td>
                <td className="px-3 py-2 text-center tabular-nums">{b.counts.stations}</td>
                <td className="px-3 py-2 text-center tabular-nums">{b.lineCount}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/bouquets/${b.id}/edit`}
                    className="inline-flex items-center gap-1 text-xs underline"
                    style={{ color: "var(--accent)" }}
                  >
                    <Play size={12} />
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {data.bouquets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs" style={{ color: "var(--muted)" }}>
                  No bouquets yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        M3U test URL: <code>/get.php?username=USER&amp;password=PASS&amp;type=m3u_plus&amp;output=ts</code>
        {" · "}
        <Link href="/admin/settings/cache" className="underline">Cache &amp; Redis</Link>
        {" · "}
        <Link href="/admin/settings/streams" className="underline">Stream settings</Link>
      </p>
    </div>
  );
}
