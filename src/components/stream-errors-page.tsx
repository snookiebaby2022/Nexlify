"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Radio, RefreshCw, Wrench } from "lucide-react";
import { notifyStreamHealthChanged } from "@/lib/stream-health-events";

type Kind = "all" | "dead" | "unstable" | "process";

type StreamErr = {
  id: string;
  name: string;
  lastProbeError: string | null;
  lastProbeAt: string | null;
  hasBackup: boolean;
  kind: "dead" | "unstable";
  server?: { name: string } | null;
  fixHint: string;
};

type ProcessErr = {
  id: string;
  status: string;
  errorMessage: string | null;
  lastSeenAt: string;
  stream: { id: string; name: string } | null;
  server: { name: string };
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleString();
}

async function fullProbe(ids: string[]) {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return { recovered: 0, stillFailed: unique.length };
  const res = await fetch("/api/admin/streams/probe-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ streamIds: unique, fast: false }),
  });
  const data = (await res.json()) as {
    results?: Record<string, { lastProbeOk?: boolean; error?: string }>;
  };
  if (!res.ok || !data.results) throw new Error("Probe failed");
  let recovered = 0;
  let stillFailed = 0;
  for (const id of unique) {
    const row = data.results[id];
    if (row && !row.error && row.lastProbeOk) recovered += 1;
    else stillFailed += 1;
  }
  notifyStreamHealthChanged();
  return { recovered, stillFailed };
}

export function StreamErrorsClient() {
  const searchParams = useSearchParams();
  const initialKind = (searchParams.get("kind") as Kind) || "all";
  const [kind, setKind] = useState<Kind>(
    initialKind === "dead" || initialKind === "unstable" || initialKind === "process" ? initialKind : "all"
  );
  const [streams, setStreams] = useState<StreamErr[]>([]);
  const [processes, setProcesses] = useState<ProcessErr[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/stream-errors", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? d.probeFails ?? []);
        setProcesses(d.processErrors ?? []);
      })
      .catch(() => setMsg("Could not load stream errors"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dead = useMemo(() => streams.filter((s) => s.kind === "dead"), [streams]);
  const unstable = useMemo(() => streams.filter((s) => s.kind === "unstable"), [streams]);
  const visible = kind === "dead" ? dead : kind === "unstable" ? unstable : streams;

  async function probeIds(ids: string[], label: string) {
    setBusy(label);
    setMsg("");
    try {
      const { recovered, stillFailed } = await fullProbe(ids);
      setMsg(
        recovered
          ? `Recovered ${recovered} stream${recovered === 1 ? "" : "s"}${stillFailed ? ` · ${stillFailed} still failing` : ""}.`
          : stillFailed
            ? `${stillFailed} still failing after full probe.`
            : "Nothing to probe."
      );
      load();
    } catch {
      setMsg("Network error while probing");
    } finally {
      setBusy(null);
    }
  }

  const tabs: { id: Kind; label: string; count: number }[] = [
    { id: "all", label: "All failed sources", count: streams.length },
    { id: "dead", label: "Dead (no backup)", count: dead.length },
    { id: "unstable", label: "Unstable (has backup)", count: unstable.length },
    { id: "process", label: "Process errors", count: processes.length },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stream errors</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Live channels whose last source check failed. Full probe clears them from the dashboard when the URL is
            actually up. Fast HEAD checks are not used here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border inline-flex items-center gap-1.5"
            style={{ borderColor: "var(--border)" }}
            onClick={load}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <Link
            href="/admin/content/streams?status=offline"
            className="text-sm px-3 py-1.5 rounded border"
            style={{ borderColor: "var(--border)" }}
          >
            Manage streams
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--muted)" }}>Dead</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{dead.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Probe failed and no backup URL</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--muted)" }}>Unstable</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{unstable.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Probe failed but a backup URL is set</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--muted)" }}>FFmpeg / process</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{processes.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Restream process errors, not source HEAD checks</p>
        </div>
      </div>

      {streams.length === 0 && processes.length === 0 && !loading ? (
        <div
          className="rounded-xl border p-6 flex items-center gap-3"
          style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)" }}
        >
          <CheckCircle2 className="text-green-500 shrink-0" />
          <div>
            <p className="font-semibold">No failed live sources</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Dashboard dead / unstable / probe-failed counts should now be zero.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setKind(t.id)}
            className="text-xs px-3 py-1.5 rounded-full border"
            style={{
              borderColor: kind === t.id ? "var(--accent)" : "var(--border)",
              background: kind === t.id ? "rgba(0,192,239,0.15)" : "transparent",
            }}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {kind !== "process" && visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => probeIds(visible.map((s) => s.id), "visible")}
            className="text-sm px-3 py-1.5 rounded text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            <Wrench size={14} />
            {busy === "visible" ? "Probing…" : `Full-probe ${visible.length} listed`}
          </button>
          {kind === "all" && dead.length > 0 && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => probeIds(dead.map((s) => s.id), "dead")}
              className="text-sm px-3 py-1.5 rounded border disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {busy === "dead" ? "Probing…" : `Full-probe ${dead.length} dead`}
            </button>
          )}
          {kind === "all" && unstable.length > 0 && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => probeIds(unstable.map((s) => s.id), "unstable")}
              className="text-sm px-3 py-1.5 rounded border disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {busy === "unstable" ? "Probing…" : `Full-probe ${unstable.length} unstable`}
            </button>
          )}
        </div>
      )}

      {msg && (
        <p className="text-sm" style={{ color: msg.toLowerCase().includes("error") ? "var(--danger)" : "#22c55e" }}>
          {msg}
        </p>
      )}

      {kind === "process" ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "rgba(0,0,0,0.2)" }}>
              <tr>
                <th className="text-left px-3 py-2">Stream</th>
                <th className="text-left px-3 py-2">Server</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Error</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No ffmpeg process errors.
                  </td>
                </tr>
              ) : (
                processes.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">{p.stream?.name ?? "—"}</td>
                    <td className="px-3 py-2">{p.server.name}</td>
                    <td className="px-3 py-2">{p.status}</td>
                    <td className="px-3 py-2 text-red-400">{p.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2">
                      {p.stream && (
                        <Link href={`/admin/content/streams?edit=${p.stream.id}`} className="underline" style={{ color: "var(--accent)" }}>
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "rgba(0,0,0,0.2)" }}>
              <tr>
                <th className="text-left px-3 py-2">Channel</th>
                <th className="text-left px-3 py-2">Kind</th>
                <th className="text-left px-3 py-2">Last error</th>
                <th className="text-left px-3 py-2">Checked</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Nothing in this list.
                  </td>
                </tr>
              ) : (
                visible.map((s) => (
                  <tr key={s.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {s.server?.name ?? "Main"}
                        {s.hasBackup ? " · backup set" : " · no backup"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                        style={{
                          background: s.kind === "dead" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                          color: s.kind === "dead" ? "#fca5a5" : "#fcd34d",
                        }}
                      >
                        {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-md">
                      <p className="text-red-400">{s.lastProbeError ?? "Probe failed"}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        {s.fixHint}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                      {formatWhen(s.lastProbeAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          className="text-xs underline disabled:opacity-50"
                          style={{ color: "var(--accent)" }}
                          onClick={() => probeIds([s.id], s.id)}
                        >
                          {busy === s.id ? "Probing…" : "Full probe"}
                        </button>
                        <Link
                          href={`/admin/content/streams?edit=${s.id}`}
                          className="text-xs underline"
                          style={{ color: "var(--accent)" }}
                        >
                          Edit source
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
        <AlertTriangle size={12} />
        <Radio size={12} />
        Recovered channels drop off this page and the dashboard dead / unstable tiles on the next refresh.
      </p>
    </div>
  );
}
