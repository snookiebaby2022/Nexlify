"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PreviewRow = { id: string; name: string; backupUrl: string; previous: string | null };

export default function BulkBackupUrlsPage() {
  const [text, setText] = useState("");
  const [stats, setStats] = useState({ total: 0, withBackup: 0, withoutPrimary: 0 });
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/streams/bulk-backup")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  async function run(dryRun: boolean) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/streams/bulk-backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "map", text, dryRun }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setPreview(data.preview ?? []);
    setUnmatched(data.unmatchedPlayers ?? data.unmatched ?? []);
    setMsg(
      dryRun
        ? `Preview: ${data.updated} stream(s) would be updated${data.unmatched?.length ? `, ${data.unmatched.length} unmatched` : ""}.`
        : `Updated ${data.updated} backup URL(s).${data.unmatched?.length ? ` ${data.unmatched.length} row(s) had no matching stream.` : ""}`
    );
    if (!dryRun) {
      fetch("/api/admin/streams/bulk-backup")
        .then((r) => r.json())
        .then(setStats);
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bulk backup sources</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Paste one mapping per line — stream ID or exact name, then backup URL. Failover uses backup when primary probe fails.
          </p>
        </div>
        <Link href="/admin/management/tools" className="text-sm link-back">
          ← Tools
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Live streams</p>
          <p className="text-xl font-semibold tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>With backup URL</p>
          <p className="text-xl font-semibold tabular-nums">{stats.withBackup}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Backup-only (no primary)</p>
          <p className="text-xl font-semibold tabular-nums">{stats.withoutPrimary}</p>
        </div>
      </div>

      <div className="rounded-lg border p-4 text-xs space-y-2" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <p className="font-medium text-sm">Format</p>
        <pre className="font-mono whitespace-pre-wrap" style={{ color: "var(--muted)" }}>
{`# stream_id|backup_url
clxyz123abc|http://provider.example/channel/101.m3u8
BBC ONE HD|http://backup.example/bbc.ts`}
        </pre>
        <p style={{ color: "var(--muted)" }}>
          Also works in Mass Edit on Manage Streams — select channels and set one backup URL for all.
        </p>
      </div>

      <textarea
        className="w-full min-h-[220px] rounded border p-3 font-mono text-xs bg-transparent"
        style={{ borderColor: "var(--border)" }}
        placeholder="Paste mappings here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => run(true)}
          className="rounded px-4 py-2 text-sm border disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => run(false)}
          className="rounded px-4 py-2 text-sm font-medium btn-positive disabled:opacity-50"
        >
          Apply backup URLs
        </button>
        <Link href="/admin/content/streams" className="rounded px-4 py-2 text-sm border self-center" style={{ borderColor: "var(--border)" }}>
          Manage streams
        </Link>
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      {unmatched.length > 0 && (
        <div className="text-xs rounded border p-3" style={{ borderColor: "#f59e0b", color: "var(--muted)" }}>
          <p className="font-medium text-sm mb-1">Unmatched keys</p>
          <p>{unmatched.slice(0, 30).join(", ")}{unmatched.length > 30 ? "…" : ""}</p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="rounded-lg border overflow-auto max-h-64" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <th className="text-left p-2">Stream</th>
                <th className="text-left p-2">New backup</th>
                <th className="text-left p-2">Previous</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 font-mono truncate max-w-[200px]">{r.backupUrl}</td>
                  <td className="p-2 font-mono truncate max-w-[160px]" style={{ color: "var(--muted)" }}>{r.previous ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
