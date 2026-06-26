"use client";

import { useEffect, useState } from "react";
import { SettingsPanel } from "@/components/settings-panel";
import { SettingsPanelForm } from "@/components/settings-panel-form";

function CacheRedisPanel() {
  const [status, setStatus] = useState<{
    redis: boolean;
    redisUrl: string;
    redisMode?: string;
    recommendedMode?: string;
  } | null>(null);
  const [flushing, setFlushing] = useState(false);

  function loadStatus() {
    fetch("/api/admin/cache").then((r) => r.json()).then(setStatus);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function flush() {
    setFlushing(true);
    await fetch("/api/admin/cache", { method: "POST" });
    setFlushing(false);
    loadStatus();
  }

  return (
    <SettingsPanel
      title="Redis"
      info="Single Redis on the panel VPS is recommended for typical Nexlify deployments (1 panel + N stream servers). Use cluster mode only when the panel runs multiple app nodes sharing cache."
    >
      <div className="space-y-3 text-sm w-full">
        <p>
          <span style={{ color: "var(--muted)" }}>Active mode: </span>
          {status?.redisMode ?? "…"}
        </p>
        <p>
          <span style={{ color: "var(--muted)" }}>Recommended: </span>
          {status?.recommendedMode ?? "single"}
        </p>
        <p>
          <span style={{ color: "var(--muted)" }}>Env: </span>
          {status?.redisUrl ?? "…"}
        </p>
        <p>
          <span style={{ color: "var(--muted)" }}>Ping: </span>
          {status == null
            ? "…"
            : status.redis
              ? "Connected"
              : status.redisUrl?.includes("not set")
                ? "N/A (in-memory)"
                : "Unreachable"}
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Set <code className="font-mono">REDIS_URL</code> for single instance, or{" "}
          <code className="font-mono">REDIS_CLUSTER_NODES=host:6379,host:6380</code> for cluster.
          See <code className="font-mono">docs/REDIS.md</code>.
        </p>
        <button
          type="button"
          disabled={flushing}
          onClick={flush}
          className="rounded px-4 py-2 text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {flushing ? "Flushing…" : "Flush all cache"}
        </button>
      </div>
    </SettingsPanel>
  );
}

export default function CacheSettingsPage() {
  return (
    <SettingsPanelForm
      group="cache"
      title="Cache & Redis"
      description="Response cache TTLs, Redis mode recommendation, and connectivity."
      topContent={<CacheRedisPanel />}
      sections={[
        {
          title: "Redis deployment",
          description: "Advisory settings — match your .env on the panel server.",
          info: "Stream servers do not need Redis; only the panel app uses it for API/stats cache.",
          fields: [
            {
              key: "redisMode",
              label: "Recommended Redis mode",
              type: "select",
              options: [
                { value: "single", label: "Single instance (default)" },
                { value: "cluster", label: "Redis Cluster (multi-node panel)" },
              ],
              hint: "Single Redis on localhost or a managed instance is enough for most installs.",
            },
            {
              key: "redisClusterNodes",
              label: "Cluster nodes (one host:port per line)",
              type: "textarea",
              colSpan: 2,
              hint: "Document planned cluster nodes; copy to REDIS_CLUSTER_NODES in production .env.",
            },
          ],
        },
        {
          title: "Cache TTL",
          description: "How long cached API responses are kept (seconds).",
          fields: [
            { key: "statsTtlSeconds", label: "Dashboard stats TTL", type: "number" },
            { key: "epgTtlSeconds", label: "EPG TTL", type: "number" },
            { key: "categoriesTtlSeconds", label: "Categories TTL", type: "number" },
            { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
          ],
        },
      ]}
    />
  );
}
