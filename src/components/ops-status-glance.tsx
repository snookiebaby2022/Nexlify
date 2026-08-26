"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HealthPayload = {
  status: string;
  checks: Record<string, string>;
  detail?: {
    cron?: { job?: string; status?: string; createdAt?: string } | null;
    servers?: { active?: number; agentsOnline?: number; cdnEndpoints?: number };
  };
};

function pill(ok: boolean | "warn") {
  if (ok === true) return { bg: "rgba(34,197,94,0.15)", color: "#16a34a", label: "OK" };
  if (ok === "warn") return { bg: "rgba(251,191,36,0.15)", color: "#d97706", label: "Check" };
  return { bg: "rgba(239,68,68,0.15)", color: "#dc2626", label: "Down" };
}

export function OpsStatusGlance() {
  const [data, setData] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const items: { key: string; label: string; state: boolean | "warn" }[] = [
    { key: "app", label: "Panel", state: data.checks.app === "ok" },
    { key: "database", label: "Database", state: data.checks.database === "ok" },
    {
      key: "redis",
      label: "Redis",
      state: data.checks.redis === "ok" ? true : data.checks.redis === "skipped" ? "warn" : false,
    },
  ];
  if (data.checks.cron) {
    items.push({
      key: "cron",
      label: "Cron",
      state: data.checks.cron === "ok" ? true : data.checks.cron === "stale" ? "warn" : "warn",
    });
  }
  if (data.checks.edge) {
    items.push({
      key: "edge",
      label: "Edge / agents",
      state:
        data.checks.edge === "ok"
          ? true
          : data.checks.edge === "none"
            ? "warn"
            : data.checks.edge === "degraded"
              ? "warn"
              : false,
    });
  }

  return (
    <div
      className="rounded-lg border px-3 py-2.5 flex flex-wrap items-center gap-2 text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <span className="font-medium mr-1">Ops status</span>
      {items.map((it) => {
        const p = pill(it.state);
        return (
          <span
            key={it.key}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: p.bg, color: p.color }}
            title={it.key}
          >
            {it.label}: {p.label}
          </span>
        );
      })}
      {data.detail?.servers && (
        <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
          Agents {data.detail.servers.agentsOnline ?? 0}/{data.detail.servers.active ?? 0}
          {typeof data.detail.servers.cdnEndpoints === "number"
            ? ` · CDN ${data.detail.servers.cdnEndpoints}`
            : ""}
        </span>
      )}
      <Link href="/admin/streaming/smart-cdn" className="text-xs underline" style={{ color: "var(--accent)" }}>
        CDN
      </Link>
      <Link href="/admin/servers" className="text-xs underline" style={{ color: "var(--accent)" }}>
        Agents
      </Link>
      <Link href="/admin/streaming/health" className="text-xs underline" style={{ color: "var(--accent)" }}>
        Health
      </Link>
    </div>
  );
}
