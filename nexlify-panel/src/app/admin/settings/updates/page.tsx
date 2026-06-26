"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PanelUpdateConfirmModal } from "@/components/panel-update-confirm-modal";
import type { NexlifyRelease } from "@/lib/panel-releases-feed";

type UpdateLog = {
  at: string;
  ok: boolean;
  message: string;
  fromVersion: string;
  toVersion: string;
  action: "update" | "rollback";
  steps?: { name: string; ok: boolean; output: string }[];
};

type PanelUpdatePayload = {
  version: {
    installedVersion: string;
    gitBranch: string | null;
    gitCommit: string | null;
    gitDirty: boolean;
    updateAvailable: boolean;
    isGitRepo: boolean;
    remoteError: string | null;
  };
  releasesFeed: {
    source: string;
    latestVersion: string | null;
    releases: NexlifyRelease[];
  } | null;
  releasesFeedError: string | null;
  repoPath: string;
  platform: string;
  canAutoUpdate: boolean;
  canRollback: boolean;
  manualSteps: string[];
  updateHistory: UpdateLog[];
  server: { rollbackGitRef: string | null; updateCheckUrl: string };
};

function channelBadge(channel: NexlifyRelease["channel"]) {
  if (channel === "rc") return { label: "RC", bg: "rgba(251, 191, 36, 0.2)", color: "#fbbf24" };
  if (channel === "beta") return { label: "Beta", bg: "rgba(56, 189, 248, 0.2)", color: "#38bdf8" };
  return { label: "Stable", bg: "rgba(34, 197, 94, 0.15)", color: "#4ade80" };
}

function ReleaseTimeline({
  release,
  isLatest,
  canUpdate,
  busy,
  onUpdate,
}: {
  release: NexlifyRelease;
  isLatest: boolean;
  canUpdate: boolean;
  busy: boolean;
  onUpdate: () => void;
}) {
  const badge = channelBadge(release.channel);
  const formatted = new Date(release.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article
      className="grid gap-4 rounded-xl border md:grid-cols-[11rem_1fr]"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <aside
        className="border-b md:border-b-0 md:border-r px-4 py-5 md:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <time className="text-xs" style={{ color: "var(--muted)" }} dateTime={release.date}>
          {formatted}
        </time>
        <p className="mt-2 font-display text-xl font-bold" style={{ color: "#00c0ef" }}>
          v{release.version}
        </p>
        <span
          className="mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
        {isLatest && canUpdate && (
          <button
            type="button"
            disabled={busy}
            onClick={onUpdate}
            className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            {busy ? "Updating…" : "Update"}
          </button>
        )}
      </aside>

      <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
        {release.notes && release.notes.length > 0 && (
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold" style={{ color: "#38bdf8" }}>
              Notes
            </h3>
            <ul className="mt-3 space-y-2">
              {release.notes.map((note) => (
                <li key={note} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                  <span className="shrink-0 text-sky-400" aria-hidden>
                    ℹ
                  </span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#22c55e" }}>
            Features
          </h3>
          <ul className="mt-3 space-y-2">
            {release.changelog.map((item) => (
              <li key={item} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                <span className="shrink-0 text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#f87171" }}>
            Bug fixes
          </h3>
          <ul className="mt-3 space-y-2">
            {release.fixes.length === 0 ? (
              <li className="text-sm" style={{ color: "var(--muted)" }}>
                No fixes listed.
              </li>
            ) : (
              release.fixes.map((item) => (
                <li key={item} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                  <span className="shrink-0 text-red-400" aria-hidden>
                    ⓘ
                  </span>
                  <span>{item}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </article>
  );
}

export default function PanelUpdatesPage() {
  const [data, setData] = useState<PanelUpdatePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/panel-update")
      .then((r) => r.json())
      .then((d: PanelUpdatePayload) => setData(d));
    fetch("/api/admin/settings?group=server")
      .then((r) => r.json())
      .then((d) => setAutoDownload(Boolean(d.settings?.panelUpdateAutoDownload)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runUpdate() {
    setConfirmOpen(false);
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/panel-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update" }),
    });
    const j = await res.json();
    setBusy(false);
    setMsg(j.result?.message ?? j.error ?? (res.ok ? "Done" : "Failed"));
    load();
  }

  async function runRollback() {
    if (!confirm("Rollback restores the git commit saved before the last successful update. Continue?")) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/panel-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rollback" }),
    });
    const j = await res.json();
    setBusy(false);
    setMsg(j.result?.message ?? j.error ?? "Failed");
    load();
  }

  async function toggleAutoDownload(checked: boolean) {
    setAutoDownload(checked);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: "server",
        settings: { panelUpdateAutoDownload: checked },
      }),
    });
  }

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading updates…</p>;
  }

  const installed = data.version.installedVersion;
  const latest = data.releasesFeed?.latestVersion ?? installed;
  const releases = data.releasesFeed?.releases ?? [];
  const showBanner = data.version.updateAvailable;

  return (
    <div className="space-y-6 pb-8 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "#00c0ef" }}>
            <span aria-hidden>↻</span> Updates
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Installed <strong>v{installed}</strong>
            {data.version.gitCommit && (
              <span className="font-mono text-xs ml-2">
                {data.version.gitBranch}@{data.version.gitCommit}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded border px-3 py-1.5 text-xs cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Refresh
        </button>
      </div>

      {showBanner && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
          style={{
            borderColor: "rgba(56, 189, 248, 0.4)",
            background: "rgba(14, 165, 233, 0.1)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
            There is an update available:{" "}
            <span className="font-mono">
              v{installed} =&gt; v{latest}
            </span>
          </p>
          <button
            type="button"
            disabled={busy || !data.canAutoUpdate}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            ☁ Update now
          </button>
        </div>
      )}

      {msg && (
        <p className="text-sm rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          {msg}
        </p>
      )}

      {!data.canAutoUpdate && (
        <p className="text-sm rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          One-click update needs a clean <strong>git</strong> install on <strong>Linux</strong>.
          {data.version.gitDirty && " Uncommitted changes must be committed or stashed first."}
          {!data.version.isGitRepo && " This server is not a git repository."}
          {data.platform !== "linux" && " Auto-update is disabled on non-Linux hosts."}
          <Link href="/admin/settings/server" className="ml-1" style={{ color: "var(--accent)" }}>
            Server settings →
          </Link>
        </p>
      )}

      <section className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(e) => toggleAutoDownload(e.target.checked)}
          />
          Auto-apply when a new release is detected
        </label>
        {data.canRollback && (
          <button
            type="button"
            disabled={busy}
            onClick={runRollback}
            className="text-sm cursor-pointer underline-offset-2 hover:underline"
            style={{ color: "var(--danger)" }}
          >
            Rollback previous version
          </button>
        )}
      </section>

      {data.releasesFeedError && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          Could not load release feed: {data.releasesFeedError}
        </p>
      )}

      <div className="space-y-6">
        {releases.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No release notes loaded. Check network access to nexlify.live/api/panel-releases.
          </p>
        ) : (
          releases.map((release, index) => (
            <ReleaseTimeline
              key={release.version}
              release={release}
              isLatest={index === 0}
              canUpdate={showBanner && data.canAutoUpdate && index === 0}
              busy={busy}
              onUpdate={() => setConfirmOpen(true)}
            />
          ))
        )}
      </div>

      {data.updateHistory.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#00c0ef" }}>
            Update history
          </h2>
          <ul className="space-y-2">
            {data.updateHistory.slice(0, 8).map((log, i) => (
              <li
                key={`${log.at}-${i}`}
                className="rounded-lg border px-4 py-3 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <span style={{ color: log.ok ? "#4ade80" : "var(--danger)" }}>
                  {log.ok ? "OK" : "Failed"}
                </span>
                {" · "}
                v{log.fromVersion} → v{log.toVersion}
                <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                  {new Date(log.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PanelUpdateConfirmModal
        open={confirmOpen}
        targetVersion={latest}
        busy={busy}
        onConfirm={runUpdate}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
