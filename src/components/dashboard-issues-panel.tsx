"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Power, RefreshCw, Wrench } from "lucide-react";
import { notifyStreamHealthChanged, STREAM_HEALTH_CHANGED } from "@/lib/stream-health-events";

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

type FailedStream = {
  id: string;
  name: string;
  kind: "dead" | "unstable";
  lastProbeError: string | null;
  fixHint?: string;
};

/**
 * Dashboard panel: surface inactive/dead streams and one-click full probes.
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
  const [failed, setFailed] = useState<FailedStream[]>([]);

  const inactive =
    local?.inactiveStreams ??
    kpi?.inactiveStreams ??
    (kpi?.inactiveLive ?? 0) + (kpi?.inactiveMovies ?? 0) + (kpi?.inactiveSeries ?? 0);
  const dead = local?.deadStreams ?? kpi?.deadStreams ?? failed.filter((s) => s.kind === "dead").length;
  const unstable = local?.unstableStreams ?? kpi?.unstableStreams ?? failed.filter((s) => s.kind === "unstable").length;
  const tickets = local?.openTickets ?? kpi?.openTickets ?? 0;
  const inactiveLive = local?.inactiveLive ?? kpi?.inactiveLive ?? 0;
  const inactiveMovies = local?.inactiveMovies ?? kpi?.inactiveMovies ?? 0;
  const inactiveSeries = local?.inactiveSeries ?? kpi?.inactiveSeries ?? 0;

  const totalIssues = inactive + dead + unstable + tickets;

  const refresh = useCallback(() => {
    fetch(`${statsUrl}${statsUrl.includes("?") ? "&" : "?"}t=${Date.now()}`)
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
    fetch("/api/admin/stream-errors", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFailed(d.streams ?? d.probeFails ?? []))
      .catch(() => {});
  }, [statsUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(STREAM_HEALTH_CHANGED, onChange);
    return () => window.removeEventListener(STREAM_HEALTH_CHANGED, onChange);
  }, [refresh]);

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
        notifyStreamHealthChanged();
        refresh();
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function probeKind(which: "dead" | "unstable" | "all") {
    const ids = failed.filter((s) => which === "all" || s.kind === which).map((s) => s.id).slice(0, 50);
    if (!ids.length) return;
    setBusy(which);
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/probe-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamIds: ids, fast: false }),
      });
      const data = (await res.json()) as {
        results?: Record<string, { lastProbeOk?: boolean; error?: string }>;
      };
      if (!res.ok || !data.results) {
        setMsg("Full probe failed");
        return;
      }
      let recovered = 0;
      let still = 0;
      for (const id of ids) {
        const row = data.results[id];
        if (row && !row.error && row.lastProbeOk) recovered += 1;
        else still += 1;
      }
      setFailed((prev) => prev.filter((s) => data.results?.[s.id]?.lastProbeOk !== true));
      setMsg(
        recovered
          ? `Cleared ${recovered} from the dashboard${still ? ` · ${still} still failing` : ""}.`
          : `${still} still failing after full probe.`
      );
      notifyStreamHealthChanged();
      refresh();
    } catch {
      setMsg("Network error while probing");
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
            Failed probes clear from this card as soon as a full probe succeeds.
          </p>
        </div>
        <Link href="/admin/stream_errors" className="ml-auto text-xs underline" style={{ color: "var(--accent)" }}>
          Stream errors
        </Link>
      </div>
    );
  }

  function IssueList({ rows }: { rows: FailedStream[] }) {
    if (!rows.length) return null;
    return (
      <ul className="mt-2 space-y-1">
        {rows.slice(0, 5).map((s) => (
          <li key={s.id} className="text-xs flex justify-between gap-2">
            <Link href={`/admin/content/streams?edit=${s.id}`} className="truncate hover:underline" style={{ color: "var(--accent)" }}>
              {s.name}
            </Link>
            <span className="truncate max-w-[50%] text-right" style={{ color: "var(--muted)" }}>
              {(s.lastProbeError ?? "Probe failed").slice(0, 80)}
            </span>
          </li>
        ))}
        {rows.length > 5 && (
          <li className="text-xs" style={{ color: "var(--muted)" }}>
            +{rows.length - 5} more
          </li>
        )}
      </ul>
    );
  }

  const deadRows = failed.filter((s) => s.kind === "dead");
  const unstableRows = failed.filter((s) => s.kind === "unstable");

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
        <Link href="/admin/stream_errors" className="text-xs underline" style={{ color: "var(--accent)" }}>
          Open repair page
        </Link>
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
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-3">
              <Power size={16} className="text-red-400 shrink-0" />
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium">{inactive.toLocaleString()} switched off in the panel</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Players cannot see them
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
            </div>
          </div>
        )}

        {dead > 0 && (
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "rgba(239,68,68,0.35)" }}>
            <div className="flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium">{dead.toLocaleString()} dead sources</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Last full/viewer check failed and there is no backup URL. Full probe here removes them from this card when the source is up.
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(busy) || deadRows.length === 0}
                onClick={() => probeKind("dead")}
                className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
                style={{ background: "#dc2626" }}
              >
                {busy === "dead" ? "Probing…" : "Full-probe dead"}
              </button>
              <Link href="/admin/stream_errors?kind=dead" className="text-xs underline" style={{ color: "var(--accent)" }}>
                Repair list
              </Link>
            </div>
            <IssueList rows={deadRows} />
          </div>
        )}

        {unstable > 0 && (
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "rgba(245,158,11,0.4)" }}>
            <div className="flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium">{unstable.toLocaleString()} unstable sources</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Primary probe failed, but a backup URL is already set. Full probe clears the dashboard flag if either source answers.
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(busy) || unstableRows.length === 0}
                onClick={() => probeKind("unstable")}
                className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
                style={{ background: "#d97706" }}
              >
                {busy === "unstable" ? "Probing…" : "Full-probe unstable"}
              </button>
              <Link href="/admin/stream_errors?kind=unstable" className="text-xs underline" style={{ color: "var(--accent)" }}>
                Repair list
              </Link>
            </div>
            <IssueList rows={unstableRows} />
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

        {(dead > 0 || unstable > 0) && (
          <button
            type="button"
            disabled={Boolean(busy) || failed.length === 0}
            onClick={() => probeKind("all")}
            className="text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1 disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            <Wrench size={12} />
            {busy === "all" ? "Probing…" : "Full-probe all failed sources"}
          </button>
        )}

        {msg && (
          <p className="text-xs" style={{ color: msg.toLowerCase().includes("fail") && !msg.startsWith("Cleared") ? "var(--danger)" : "#22c55e" }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
