"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, HardDrive, Wifi, Settings, Zap } from "lucide-react";

type Metrics = {
  cpu: number;
  memory: number;
  connections: number;
  uptime: number;
};

type Config = {
  autoScaleEnabled: boolean;
  autoScaleMinInstances: number;
  autoScaleMaxInstances: number;
  autoScaleCpuThreshold: number;
  autoScaleCooldownSec: number;
};

export default function AutoScalePage() {
  const [metrics, setMetrics] = useState<Metrics>({ cpu: 0, memory: 0, connections: 0, uptime: 0 });
  const [instances, setInstances] = useState(0);
  const [config, setConfig] = useState<Config>({
    autoScaleEnabled: false,
    autoScaleMinInstances: 1,
    autoScaleMaxInstances: 4,
    autoScaleCpuThreshold: 80,
    autoScaleCooldownSec: 300,
  });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/auto-scale")
      .then((r) => r.json())
      .then((d) => {
        setMetrics(d.metrics ?? { cpu: 0, memory: 0, connections: 0, uptime: 0 });
        setInstances(d.instances ?? 0);
        if (d.config) setConfig(d.config);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function scaleTo(n: number) {
    const res = await fetch("/api/admin/auto-scale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scale", instances: n }),
    });
    const data = await res.json();
    if (data.ok) {
      setInstances(data.instances);
      setMsg(`Scaled to ${data.instances} instances`);
    } else {
      setMsg(data.error ?? "Scale failed");
    }
  }

  async function saveConfig() {
    const res = await fetch("/api/admin/auto-scale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config", ...config }),
    });
    const data = await res.json();
    setMsg(data.ok ? "Config saved" : data.error ?? "Save failed");
  }

  async function autoScale() {
    const res = await fetch("/api/admin/auto-scale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto" }),
    });
    const data = await res.json();
    if (data.action === "none") {
      setMsg(`No scaling needed (CPU: ${data.cpu?.toFixed(1)}%, instances: ${data.instances})`);
    } else {
      setMsg(`Auto-scaled: ${data.action} from ${data.from} to ${data.to} (CPU: ${data.cpu?.toFixed(1)}%)`);
      setInstances(data.to);
    }
  }

  const cpuColor = metrics.cpu > 80 ? "#ef4444" : metrics.cpu > 50 ? "#f59e0b" : "#22c55e";
  const memColor = metrics.memory > 80 ? "#ef4444" : metrics.memory > 50 ? "#f59e0b" : "#22c55e";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Auto-Scale Manager</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Monitor server load and scale PM2 instances automatically.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {msg}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <Cpu size={14} style={{ color: cpuColor }} />
            CPU
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: cpuColor }}>{metrics.cpu.toFixed(1)}%</p>
          <div className="h-1.5 rounded-full mt-2" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, metrics.cpu)}%`, background: cpuColor }} />
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <HardDrive size={14} style={{ color: memColor }} />
            Memory
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: memColor }}>{metrics.memory.toFixed(1)}%</p>
          <div className="h-1.5 rounded-full mt-2" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, metrics.memory)}%`, background: memColor }} />
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <Zap size={14} />
            Instances
          </div>
          <p className="text-2xl font-bold mt-1">{instances}</p>
          <div className="flex gap-1 mt-2">
            <button type="button" onClick={() => scaleTo(Math.max(1, instances - 1))} className="px-2 py-0.5 rounded text-xs cursor-pointer border" style={{ borderColor: "var(--border)" }}>-</button>
            <button type="button" onClick={() => scaleTo(instances + 1)} className="px-2 py-0.5 rounded text-xs cursor-pointer border" style={{ borderColor: "var(--border)" }}>+</button>
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <Wifi size={14} />
            Uptime
          </div>
          <p className="text-2xl font-bold mt-1">{Math.floor(metrics.uptime / 3600)}h</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{Math.floor(metrics.uptime / 60)}m total</p>
        </div>
      </div>

      {/* Auto-scale config */}
      <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex items-center gap-2">
          <Settings size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-sm font-semibold">Auto-Scale Configuration</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.autoScaleEnabled}
              onChange={(e) => setConfig({ ...config, autoScaleEnabled: e.target.checked })}
            />
            Enable auto-scaling
          </label>
          <div />
          <label className="block text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Min instances</span>
            <input
              type="number"
              min={1}
              max={16}
              className="w-full rounded border px-2 py-1.5 text-sm bg-transparent mt-1"
              style={{ borderColor: "var(--border)" }}
              value={config.autoScaleMinInstances}
              onChange={(e) => setConfig({ ...config, autoScaleMinInstances: parseInt(e.target.value) || 1 })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Max instances</span>
            <input
              type="number"
              min={1}
              max={16}
              className="w-full rounded border px-2 py-1.5 text-sm bg-transparent mt-1"
              style={{ borderColor: "var(--border)" }}
              value={config.autoScaleMaxInstances}
              onChange={(e) => setConfig({ ...config, autoScaleMaxInstances: parseInt(e.target.value) || 4 })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>CPU threshold %</span>
            <input
              type="number"
              min={10}
              max={100}
              className="w-full rounded border px-2 py-1.5 text-sm bg-transparent mt-1"
              style={{ borderColor: "var(--border)" }}
              value={config.autoScaleCpuThreshold}
              onChange={(e) => setConfig({ ...config, autoScaleCpuThreshold: parseInt(e.target.value) || 80 })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Cooldown (seconds)</span>
            <input
              type="number"
              min={30}
              max={3600}
              className="w-full rounded border px-2 py-1.5 text-sm bg-transparent mt-1"
              style={{ borderColor: "var(--border)" }}
              value={config.autoScaleCooldownSec}
              onChange={(e) => setConfig({ ...config, autoScaleCooldownSec: parseInt(e.target.value) || 300 })}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveConfig}
            className="rounded px-4 py-2 text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Save Config
          </button>
          <button
            type="button"
            onClick={autoScale}
            className="rounded px-4 py-2 text-sm font-medium cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
          >
            Run Auto-Scale Now
          </button>
        </div>
      </div>
    </div>
  );
}
