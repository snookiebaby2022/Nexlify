"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Cpu, Radio, RefreshCw, Server, Tv, Users, Zap, Gpu, Globe } from "lucide-react";
import { NEXLIFY_STACK } from "@/lib/nexlify-stack";

type Snapshot = {
  summary: {
    servers: number;
    serversOnline: number;
    liveStreams: number;
    streamsPlayable: number;
    directSources: number;
    onDemandChannels: number;
    transcodeChannels: number;
    runningProcesses: number;
    activeViewers: number;
    magDevices: number;
    enigmaDevices: number;
  };
  features: Record<string, unknown>;
  servers: {
    id: string;
    name: string;
    host: string;
    agentOnline: boolean;
    streamCount: number;
    processCount: number;
    healthStatus: string;
  }[];
  processes: {
    serverName: string;
    streamName: string;
    status: string;
    cpuPercent: number | null;
    bitrateKbps: number | null;
  }[];
};

export default function StreamingEnginePage() {
  const [data, setData] = useState<Snapshot | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/streaming/engine")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading streaming engine…</p>;
  }

  const s = data.summary;

  return (
    <div className="space-y-5 max-w-6xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">All-in-one streaming</p>
          <h1 className="text-lg font-semibold text-white">Streaming Engine</h1>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Panel orchestration layer — agents, transcode processes, load balancing, and playback routing. Works with dedicated stream servers or single-node installs.
      </p>

      <div className="rounded-lg border p-4 text-sm space-y-2" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <p className="font-semibold flex items-center gap-2"><Zap size={14} /> Recommended stream stack</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
          <li>One-click installer on each VPS: nginx + FFmpeg + agent (+ Redis for Fast Zap cache).</li>
          <li><strong>HLS (.m3u8)</strong> as default live output — most stable for web and modern apps.</li>
          <li>nginx: <code className="text-[10px]">proxy_buffering off</code> on all <code className="text-[10px]">/live/</code> paths (Anti-Freeze).</li>
          <li>Neighbour-channel prefetch + low-latency redirects enabled by default in Settings → Streaming.</li>
          <li>Check <Link href="/admin/streaming/health" className="underline" style={{ color: "var(--accent)" }}>Stream Health</Link> daily; fix dead/unstable streams and set backup URLs.</li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/admin/servers/install" className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>Install wizard</Link>
          <Link href="/admin/servers/nginx-config" className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>nginx config</Link>
          <Link href="/admin/management/tools/bulk-backup-urls" className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>Bulk backup URLs</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Server, label: NEXLIFY_STACK.nginx.label, sub: NEXLIFY_STACK.nginx.features.slice(0, 3).join(" · ") },
          { icon: Radio, label: NEXLIFY_STACK.ffmpeg.label, sub: "CUDA / NVENC GPU profiles" },
          { icon: Gpu, label: NEXLIFY_STACK.gpu.label, sub: "Full NVIDIA ladder" },
          { icon: Globe, label: NEXLIFY_STACK.geo.label, sub: "MaxMind + network rules" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <c.icon size={18} style={{ color: "var(--accent)" }} />
            <p className="text-sm font-semibold mt-2">{c.label}</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Server, label: "Servers online", value: `${s.serversOnline}/${s.servers}` },
          { icon: Tv, label: "Playable streams", value: `${s.streamsPlayable}/${s.liveStreams}` },
          { icon: Users, label: "Active viewers", value: String(s.activeViewers) },
          { icon: Cpu, label: "FFmpeg processes", value: String(s.runningProcesses) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <c.icon size={18} style={{ color: "var(--accent)" }} />
            <p className="text-2xl font-bold mt-2 tabular-nums">{c.value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="font-medium mb-2">Delivery modes</p>
          <p>Direct relay: <strong>{s.directSources}</strong></p>
          <p>On-demand: <strong>{s.onDemandChannels}</strong></p>
          <p>Always-on transcode: <strong>{s.transcodeChannels}</strong></p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="font-medium mb-2">STB devices</p>
          <p>MAG active: <strong>{s.magDevices}</strong></p>
          <p>Enigma2 active: <strong>{s.enigmaDevices}</strong></p>
          <Link href="/admin/devices" className="text-xs underline mt-2 inline-block" style={{ color: "var(--accent)" }}>Device center →</Link>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="font-medium mb-2">Engine features</p>
          <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
            <li>{data.features.antiFreeze ? "✓" : "○"} Anti-freeze</li>
            <li>{data.features.fastZap ? "✓" : "○"} Fast zapping</li>
            <li>{data.features.geoLb ? "✓" : "○"} Geo load balancing</li>
            <li>{data.features.transcodePack ? "✓" : "○"} GPU transcoding pack</li>
            <li>{data.features.lbPro ? "✓" : "○"} Intelligent LB Pro</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/servers" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Manage servers</Link>
        <Link href="/admin/streaming/transcoding" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Transcoding</Link>
        <Link href="/admin/servers/load-balancer" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Load balancer</Link>
        <Link href="/admin/streaming/health" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Streaming health</Link>
        <Link href="/webplayer" target="_blank" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Web player</Link>
      </div>

      <section className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold px-4 py-3 flex items-center gap-2" style={{ background: "rgba(0,192,239,0.1)" }}>
          <Activity size={16} /> Streaming servers
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="px-3 py-2 text-left">Server</th>
              <th className="px-3 py-2 text-center">Agent</th>
              <th className="px-3 py-2 text-center">Streams</th>
              <th className="px-3 py-2 text-center">Processes</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.servers.map((srv) => (
              <tr key={srv.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2">
                  <span className="font-medium">{srv.name}</span>
                  <span className="block text-xs" style={{ color: "var(--muted)" }}>{srv.host}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={srv.agentOnline ? "text-green-400" : "text-red-400"}>{srv.agentOnline ? "ONLINE" : "OFFLINE"}</span>
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{srv.streamCount}</td>
                <td className="px-3 py-2 text-center tabular-nums">{srv.processCount}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/servers/${srv.id}/edit`} className="text-xs underline" style={{ color: "var(--accent)" }}>Configure</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.processes.length > 0 && (
        <section className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold px-4 py-3 flex items-center gap-2" style={{ background: "rgba(0,192,239,0.1)" }}>
            <Zap size={16} /> Active transcode processes
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="px-3 py-2 text-left">Server</th>
                <th className="px-3 py-2 text-left">Stream</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">CPU</th>
                <th className="px-3 py-2 text-center">Bitrate</th>
              </tr>
            </thead>
            <tbody>
              {data.processes.map((p, i) => (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2">{p.serverName}</td>
                  <td className="px-3 py-2">{p.streamName}</td>
                  <td className="px-3 py-2 text-center">{p.status}</td>
                  <td className="px-3 py-2 text-center">{p.cpuPercent != null ? `${p.cpuPercent.toFixed(0)}%` : "—"}</td>
                  <td className="px-3 py-2 text-center">{p.bitrateKbps != null ? `${p.bitrateKbps} kbps` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
