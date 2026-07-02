"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LbServer = {
  id: string;
  name: string;
  host: string;
  region?: string | null;
  connections: number;
  bandwidthMbps: number;
  maxCapacity: number;
  loadScore: number;
  healthStatus: string;
  online: boolean;
  rankReasons: string[];
};

type LbConfig = {
  loadBalancing: string;
  geoLoadBalancing: boolean;
  loadBalancingRestriction: string;
  lbProEnabled: boolean;
  lbPro: {
    enabled?: boolean;
    geoRouting?: boolean;
    bandwidthAware?: boolean;
    failoverOnDegraded?: boolean;
    healthCheckIntervalSec?: number;
    cloudflareGuidance?: boolean;
  };
};

export default function LoadBalancerPage() {
  const [servers, setServers] = useState<LbServer[]>([]);
  const [config, setConfig] = useState<LbConfig | null>(null);
  const [testIp, setTestIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    const q = testIp.trim() ? `?testIp=${encodeURIComponent(testIp.trim())}` : "";
    fetch(`/api/admin/servers/load-balancer${q}`)
      .then((r) => r.json())
      .then((d) => {
        setServers(d.servers ?? []);
        setConfig(d.config ?? null);
      });
  }, [testIp]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const maxConn = useMemo(() => Math.max(...servers.map((s) => s.connections || 0), 1), [servers]);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/servers/load-balancer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streams: {
          loadBalancing: config.loadBalancing,
          geoLoadBalancing: config.geoLoadBalancing,
          loadBalancingRestriction: config.loadBalancingRestriction,
        },
        lbPro: config.lbPro,
      }),
    });
    setSaving(false);
    setMsg(res.ok ? "Load balancer settings saved." : "Save failed");
    if (res.ok) load();
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Load Balancer</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Real-time distribution + XUI-style routing rules. {config?.lbProEnabled ? "Intelligent LB Pro active." : "Enable LB Pro for geo + bandwidth-aware routing."}
          </p>
        </div>
        <Link href="/admin/settings/lb-pro" className="text-sm underline" style={{ color: "var(--accent)" }}>
          LB Pro addon
        </Link>
        <Link href="/admin/servers/nginx-config" className="text-sm underline" style={{ color: "var(--accent)" }}>
          nginx config
        </Link>
      </div>

      {config && (
        <div className="rounded-lg border p-4 grid md:grid-cols-2 lg:grid-cols-4 gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <label className="text-sm block">
            <span className="font-medium">Algorithm</span>
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 panel-select bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              value={String(config.loadBalancing)}
              onChange={(e) => setConfig({ ...config, loadBalancing: e.target.value })}
            >
              <option value="server_slots">Server slots available</option>
              <option value="round_robin">Round robin</option>
              <option value="least_connections">Least connections</option>
            </select>
          </label>
          <label className="text-sm block">
            <span className="font-medium">Overload policy</span>
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 panel-select bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              value={String(config.loadBalancingRestriction)}
              onChange={(e) => setConfig({ ...config, loadBalancingRestriction: e.target.value })}
            >
              <option value="stop_overloaded">Stop client if overloaded</option>
              <option value="allow_queue">Allow queue</option>
              <option value="failover">Failover to next server</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
            <input
              type="checkbox"
              checked={config.geoLoadBalancing === true}
              onChange={(e) => setConfig({ ...config, geoLoadBalancing: e.target.checked })}
            />
            Geo-aware routing
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveConfig}
              className="rounded px-4 py-2 text-sm font-medium btn-positive disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save rules"}
            </button>
          </div>
          {msg && <p className="text-xs md:col-span-4" style={{ color: "var(--muted)" }}>{msg}</p>}
        </div>
      )}

      {config && (
        <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-sm">Intelligent LB Pro — detailed routing</h2>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: config.lbProEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)" }}>
              {config.lbProEnabled ? "Licensed & active" : "Enable addon for geo + bandwidth routing"}
            </span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.lbPro.enabled === true}
                onChange={(e) => setConfig({ ...config, lbPro: { ...config.lbPro, enabled: e.target.checked } })}
              />
              Enable intelligent LB
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.lbPro.geoRouting !== false}
                onChange={(e) => setConfig({ ...config, lbPro: { ...config.lbPro, geoRouting: e.target.checked } })}
              />
              Geo routing (country / ISP rules per server)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.lbPro.bandwidthAware !== false}
                onChange={(e) => setConfig({ ...config, lbPro: { ...config.lbPro, bandwidthAware: e.target.checked } })}
              />
              Bandwidth-aware (headroom before assign)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.lbPro.failoverOnDegraded !== false}
                onChange={(e) => setConfig({ ...config, lbPro: { ...config.lbPro, failoverOnDegraded: e.target.checked } })}
              />
              Failover when server degraded/offline
            </label>
            <label className="block">
              <span className="text-xs font-medium">Health poll interval (sec)</span>
              <input
                type="number"
                min={10}
                max={300}
                className="mt-1 w-full rounded border px-2 py-1.5 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={Number(config.lbPro.healthCheckIntervalSec ?? 30)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    lbPro: { ...config.lbPro, healthCheckIntervalSec: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer self-end">
              <input
                type="checkbox"
                checked={config.lbPro.cloudflareGuidance !== false}
                onChange={(e) => setConfig({ ...config, lbPro: { ...config.lbPro, cloudflareGuidance: e.target.checked } })}
              />
              Cloudflare / CDN guidance
            </label>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Per-server: set <strong>region</strong>, <strong>max clients</strong>, <strong>bandwidth Mbps</strong>, and geo allow-lists on each server under Manage Servers → Edit.
            Lines can force a server or use automatic LB on playback.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <span className="font-medium">Simulate client IP</span>
          <input
            className="block mt-1 rounded border px-3 py-1.5 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            placeholder="e.g. 203.0.113.10"
            value={testIp}
            onChange={(e) => setTestIp(e.target.value)}
          />
        </label>
        <button type="button" onClick={load} className="rounded px-3 py-1.5 text-sm border" style={{ borderColor: "var(--border)" }}>
          Test routing
        </button>
      </div>

      <div className="space-y-3">
        {servers.map((s) => {
          const pct = ((s.connections || 0) / maxConn) * 100;
          const healthy = s.online || s.healthStatus === "online" || s.healthStatus === "healthy";
          return (
            <div key={s.id} className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: healthy ? "#22c55e" : "#ef4444" }} />
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{s.host}</span>
                  {s.region && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(56,189,248,0.15)" }}>
                      {s.region}
                    </span>
                  )}
                </div>
                <span className="text-xs tabular-nums">
                  {s.connections} conn · {s.bandwidthMbps} Mbps · load {s.loadScore}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#38bdf8" }} />
              </div>
              {s.rankReasons?.length > 0 && (
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  Routing: {s.rankReasons.join(" · ")}
                </p>
              )}
            </div>
          );
        })}
        {!servers.length && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No streaming servers — add one under Streaming Servers.</p>
        )}
      </div>
    </div>
  );
}
