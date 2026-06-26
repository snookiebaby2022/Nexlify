"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { EPG_WORKING_LINKS } from "@/lib/epg-working-links";

export default function AdminEpgSourcesPage() {
  const [sources, setSources] = useState<
    {
      id: string;
      name: string;
      url: string;
      lastSync: string | null;
      syncEveryHours: number;
      lastSyncError: string | null;
      _count: { programs: number };
    }[]
  >([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/admin/epg")
      .then((r) => r.json())
      .then((d) => setSources(d.sources));
  }

  useEffect(() => {
    load();
  }, []);

  async function sync(id: string) {
    setSyncing(id);
    setMsg("");
    const res = await fetch("/api/admin/epg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync: true, sourceId: id }),
    });
    const data = await res.json();
    setSyncing(null);
    if (!res.ok) setMsg(data.error ?? "Sync failed");
    else setMsg(`Synced ${data.programsImported ?? 0} programmes`);
    load();
  }

  async function forceSyncAll() {
    setSyncing("all");
    setMsg("");
    const res = await fetch("/api/admin/epg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncAll: true }),
    });
    const data = await res.json();
    setSyncing(null);
    setMsg(
      res.ok
        ? `Force synced ${data.synced ?? 0} / ${data.total ?? 0} source(s)`
        : data.error ?? "Sync failed"
    );
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/epg?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">EPG sources</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncing === "all"}
            className="text-sm px-3 py-2 rounded-md border cursor-pointer disabled:opacity-50"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
            onClick={forceSyncAll}
          >
            {syncing === "all" ? "Force syncing…" : "Force sync all"}
          </button>
          <Link
            href="/admin/epg/countries"
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Countries
          </Link>
          <Link
            href="/admin/epg/add"
            className="text-sm px-3 py-2 rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + Add EPG
          </Link>
        </div>
      </div>
      {msg && <p className="text-sm" style={{ color: "var(--muted)" }}>{msg}</p>}

      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <p className="font-medium mb-2">Working guide links</p>
        <div className="flex flex-wrap gap-2">
          {EPG_WORKING_LINKS.map((l) => (
            <Link
              key={l.code}
              href={`/admin/epg/add?url=${encodeURIComponent(l.url)}&name=${encodeURIComponent(l.label)}`}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
            >
              + {l.label}
            </Link>
          ))}
        </div>
      </div>

      <DataTable
        headers={["Name", "Programs", "Sync every (h)", "Last sync", "Actions"]}
        rows={sources.map((s) => [
          <span key={s.id}>
            {s.name}
            {s.lastSyncError && (
              <span className="block text-xs" style={{ color: "var(--danger)" }}>
                {s.lastSyncError}
              </span>
            )}
          </span>,
          s._count.programs,
          <input
            key={`h-${s.id}`}
            type="number"
            min={1}
            className="w-16 rounded border px-1 py-0.5 text-xs bg-transparent"
            style={{ borderColor: "var(--border)" }}
            defaultValue={s.syncEveryHours}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v) && v !== s.syncEveryHours) {
                fetch(`/api/admin/epg/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ syncEveryHours: v }),
                }).then(() => load());
              }
            }}
          />,
          s.lastSync ? formatDateTime(s.lastSync) : "Never",
          <span key={`act-${s.id}`} className="flex gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={syncing === s.id}
              onClick={() => sync(s.id)}
            >
              {syncing === s.id ? "Syncing…" : "Force sync"}
            </button>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(s.id)}
            >
              Delete
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
