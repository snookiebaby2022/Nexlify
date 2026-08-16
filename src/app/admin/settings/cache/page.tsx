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
    memory?: {
      ok: boolean;
      maxmemory: string;
      maxmemoryPolicy: string;
      usedMemory: string;
      healthy: boolean;
      hint: string;
    } | null;
  } | null>(null);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  function loadStatus() {
    fetch("/api/admin/cache").then((r) => r.json()).then(setStatus);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function flush() {
    setFlushing(true);
    const res = await fetch("/api/admin/cache", { method: "POST" });
    const data = res.ok ? await res.json() : null;
    setFlushing(false);
    loadStatus();
    if (data?.ms != null) {
      setFlushResult(`${data.deleted ?? 0} keys cleared in ${data.ms}ms`);
    }
  }

  return (
    <SettingsPanel
      title="Redis connectivity"
      info="Redis is optional but recommended for production. The panel uses it for dashboard stats, EPG cache, fast-zap playback URLs, and rate limiting. Stream servers do not need Redis."
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
          <code className="font-mono text-xs">{status?.redisUrl ?? "…"}</code>
        </p>
        <p>
          <span style={{ color: "var(--muted)" }}>Ping: </span>
          {status == null
            ? "…"
            : status.redis
              ? "Connected"
              : status.redisUrl?.includes("not set")
                ? "N/A (in-memory fallback)"
                : "Unreachable — check REDIS_URL and firewall"}
        </p>
        {status?.memory ? (
          <div
            className="rounded-lg border px-3 py-2 text-xs space-y-1"
            style={{
              borderColor: status.memory.healthy ? "rgba(34,197,94,0.45)" : "rgba(245,158,11,0.55)",
              background: status.memory.healthy ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
            }}
          >
            <p>
              Memory used: <code className="font-mono">{status.memory.usedMemory}</code>
              {" · "}
              maxmemory: <code className="font-mono">{status.memory.maxmemory}</code>
              {" · "}
              policy: <code className="font-mono">{status.memory.maxmemoryPolicy}</code>
            </p>
            <p style={{ color: "var(--muted)" }}>{status.memory.hint}</p>
          </div>
        ) : null}
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          <strong>Single instance:</strong> set <code className="font-mono">REDIS_URL=redis://127.0.0.1:6379</code> on
          the panel VPS. <strong>Cluster:</strong> use <code className="font-mono">REDIS_CLUSTER_NODES</code> when
          running multiple panel nodes. Without Redis, caches fall back to in-process memory (not shared across PM2
          workers).
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
        {flushResult ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {flushResult}
          </p>
        ) : null}
      </div>
    </SettingsPanel>
  );
}

export default function CacheSettingsPage() {
  return (
    <SettingsPanelForm
      group="cache"
      title="Cache & Redis"
      description="Response cache TTLs, Redis deployment guidance, and cache key behaviour."
      topContent={<CacheRedisPanel />}
      sections={[
        {
          title: "Redis deployment",
          description: "Advisory settings — mirror these in your panel .env.",
          info: "For a typical single-VPS install, one Redis on localhost is sufficient. Use cluster mode only with multiple panel app servers behind a load balancer.",
          fields: [
            {
              key: "redisMode",
              label: "Recommended Redis mode",
              type: "select",
              options: [
                { value: "single", label: "Single instance (default)" },
                { value: "cluster", label: "Redis Cluster (multi-node panel)" },
              ],
              hint: "Document your deployment choice for operators.",
            },
            {
              key: "redisClusterNodes",
              label: "Cluster nodes (one host:port per line)",
              type: "textarea",
              colSpan: 2,
              hint: "Copy to REDIS_CLUSTER_NODES in production .env when using cluster.",
            },
            {
              key: "redisMaxMemory",
              label: "Suggested maxmemory policy",
              type: "text",
              placeholder: "256mb allkeys-lru",
              hint: "Example redis.conf: maxmemory 512mb + maxmemory-policy allkeys-lru.",
            },
            {
              key: "redisKeyPrefix",
              label: "Key prefix",
              type: "text",
              placeholder: "nexlify:",
              hint: "Useful when sharing Redis with other apps on the same instance.",
            },
          ],
        },
        {
          title: "Cache TTL",
          description: "How long cached API responses are kept (seconds). Lower = fresher data, more DB load.",
          fields: [
            {
              key: "statsTtlSeconds",
              label: "Dashboard stats TTL",
              type: "number",
              hint: "5–30 for live dashboards. Lower = fresher stats, slightly more DB load.",
            },
            {
              key: "epgTtlSeconds",
              label: "EPG TTL",
              type: "number",
              hint: "300–900 for large EPG sources.",
            },
            {
              key: "categoriesTtlSeconds",
              label: "Categories TTL",
              type: "number",
              hint: "Rarely changes — 120–600 is fine.",
            },
            {
              key: "playbackUrlCacheTtlSec",
              label: "Playback URL cache TTL",
              type: "number",
              hint: "Should align with Streaming → Fast zapping TTL when Redis is enabled.",
            },
            {
              key: "flushOnPanelUpdate",
              label: "Flush cache after panel update",
              type: "yesno",
              hint: "Clears stale API responses after a successful panel upgrade.",
            },
            { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
          ],
        },
      ]}
    />
  );
}
