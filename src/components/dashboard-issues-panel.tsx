"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Power, RefreshCw, Wrench } from "lucide-react";

type IssueStats = {
  inactiveStreams?: number;
  inactiveLive?: number;
  inactiveMovies?: number;
  inactiveSeries?: number;
  deadStreams?: number;
  unstableStreams?: number;
  offlineStreams?: number;
  openTickets?: number;
};

/**
 * Dashboard panel: surface inactive/dead streams and one-click fixes.
 */
export function DashboardIssuesPanel({
  statsUrl = "/api/admin/stats",
  kpi,
  hideWhenHealthy = false,
}: {
  statsUrl?: string;
  hideWhenHealthy?: boolean;
  kpi?: {
    deadStreams?: number;
    unstableStreams?: number;
    inactiveStreams?: number;
    inactiveLive?: number;
    inactiveMovies?: number;
    inactiveSeries?: number;
    offlineStreams?: number;
    openTickets?: number;
  };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [local, setLocal] = useState<IssueStats | null>(null);

  const inactive =
    local?.inactiveStreams ??
    kpi?.inactiveStreams ??
    (kpi?.inactiveLive ?? 0) + (kpi?.inactiveMovies ?? 0) + (kpi?.inactiveSeries ?? 0);
  const dead = local?.deadStreams ?? kpi?.deadStreams ?? 0;
  const unstable = local?.unstableStreams ?? kpi?.unstableStreams ?? 0;
  const offline = local?.offlineStreams ?? kpi?.offlineStreams ?? 0;
  const tickets = local?.openTickets ?? kpi?.openTickets ?? 0;
  const inactiveLive = local?.inactiveLive ?? kpi?.inactiveLive ?? 0;
  const inactiveMovies = local?.inactiveMovies ?? kpi?.inactiveMovies ?? 0;
  const inactiveSeries = local?.inactiveSeries ?? kpi?.inactiveSeries ?? 0;

  // offline already includes dead + unstable (failed source probes).
  const totalIssues = inactive + offline + tickets;

  const refresh = useCallback(() => {
    fetch(statsUrl)
      .then((r) => r.json())
      .then((d) => {
        const k = d.dashboardKpi ?? {};
        setLocal({
          inactiveStreams: k.inactiveStreams ?? 0,
          inactiveLive: k.inactiveLive ?? 0,
          inactiveMovies: k.inactiveMovies ?? 0,
          inactiveSeries: k.inactiveSeries ?? 0,
          deadStreams: k.deadStreams ?? 0,
          unstableStreams: k.unstableStreams ?? 0,
          offlineStreams: k.offlineStreams ?? (k.deadStreams ?? 0) + (k.unstableStreams ?? 0),
          openTickets: d.openTickets ?? k.openTickets ?? 0,
        });
      })
      .catch(() => {});
  }, [statsUrl]);

  useEffect(() => {
    if (kpi && hideWhenHealthy) return;
    refresh();
  }, [refresh, kpi, hideWhenHealthy]);

  async function activateAllInactive() {
    if (
      !confirm(
        `Activate all ${inactive.toLocaleString()} inactive stream(s)?\n\nThis turns offline content back on for players.`
      )
    ) {
      return;
    }
    setBusy("activate");
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/fix-inactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable_all_inactive" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Failed to activate streams");
      } else {
        setMsg(`Activated ${data.updated ?? 0} inactive stream(s).`);
        refresh();
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(null);
    }
  }

  if (totalIssues === 0 && !msg) {
    if (hideWhenHealthy) return null;
    return (
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)" }}
      >
        <CheckCircle2 size={20} className="text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold">No stream issues detected</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            All content looks active. Use Categories to toggle streams online/offline by group.
          </p>
        </div>
        <Link href="/admin/management/categories" className="ml-auto text-xs underline" style={{ color: "var(--accent)" }}>
          Categories
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(239,68,68,0.35)", background: "var(--bg-card)" }}
    >
      <div
        className="px-4 py-3 flex flex-wrap items-center gap-2 border-b"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(245,158,11,0.08) 100%)",
        }}
      >
        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold flex-1">Issues to fix</h2>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1"
          style={{ borderColor: "var(--border)" }}
          onClick={refresh}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="p-4 space-y-3">
        {inactive > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <Power size={16} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium">{inactive.toLocaleString()} inactive streams</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Off in panel — players will not see them
                {inactiveLive ? ` · Live ${inactiveLive}` : ""}
                {inactiveMovies ? ` · Movies ${inactiveMovies}` : ""}
                {inactiveSeries ? ` · Series ${inactiveSeries}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === "activate"}
              onClick={activateAllInactive}
              className="text-xs px-3 py-1.5 rounded text-white inline-flex items-center gap-1 disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              <Wrench size={12} />
              {busy === "activate" ? "Fixing…" : "Activate all"}
            </button>
            {inactiveLive > 0 && (
              <Link href="/admin/content/streams?status=inactive" className="text-xs underline" style={{ color: "var(--accent)" }}>
                Review live
              </Link>
            )}
            {inactiveMovies > 0 && (
              <Link href="/admin/content/movies?status=inactive" className="text-xs underline" style={{ color: "var(--accent)" }}>
                Review movies
              </Link>
            )}
            {inactiveSeries > 0 && (
              <Link href="/admin/content/series?status=inactive" className="text-xs underline" style={{ color: "var(--accent)" }}>
                Review series
              </Link>
            )}
          </div>
        )}

        {dead > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium">{dead.toLocaleString()} dead streams</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Viewer reported offline or probe failed (no backup)</p>
            </div>
            <Link
              href="/admin/content/streams?status=offline&sourceIssue=dead"
              className="text-xs px-3 py-1.5 rounded border"
              style={{ borderColor: "var(--border)" }}
            >
              Fix dead streams
            </Link>
          </div>
        )}

        {unstable > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium">{unstable.toLocaleString()} unstable streams</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Viewer reported offline or probe failed (backup set)</p>
            </div>
            <Link
              href="/admin/content/streams?status=offline&sourceIssue=unstable"
              className="text-xs px-3 py-1.5 rounded border"
              style={{ borderColor: "var(--border)" }}
            >
              Fix unstable streams
            </Link>
          </div>
        )}

        {offline > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <Power size={16} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium">{offline.toLocaleString()} live streams with a failed source</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                last probe failed — not the same as inactive, and not “no ffmpeg running”
              </p>
            </div>
            <Link
              href="/admin/content/streams?status=offline"
              className="text-xs px-3 py-1.5 rounded border"
              style={{ borderColor: "var(--border)" }}
            >
              Review offline
            </Link>
          </div>
        )}

        {tickets > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium">{tickets} open support ticket(s)</p>
            </div>
            <Link href="/admin/tickets?status=OPEN" className="text-xs underline" style={{ color: "var(--accent)" }}>
              Open tickets
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs pt-1" style={{ color: "var(--muted)" }}>
          <Link href="/admin/management/categories" className="underline" style={{ color: "var(--accent)" }}>
            Edit by category (online/offline)
          </Link>
          <Link href="/admin/management/mass-edit/streams" className="underline" style={{ color: "var(--accent)" }}>
            Mass edit streams
          </Link>
          <Link href="/admin/content/movies?status=inactive" className="underline" style={{ color: "var(--accent)" }}>
            Inactive movies
          </Link>
          <Link href="/admin/content/series?status=inactive" className="underline" style={{ color: "var(--accent)" }}>
            Inactive series
          </Link>
        </div>

        {msg && (
          <p className="text-xs" style={{ color: msg.startsWith("Activated") ? "#22c55e" : "var(--danger)" }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
