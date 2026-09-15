"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Group = {
  key: string;
  tier: string;
  canonical: string;
  suggested: string;
  streams: { id: string; name: string; categoryName: string | null; epgChannelId: string | null }[];
};

export default function TitleSyncPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/streams/title-sync")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(group: Group, suggested: string) {
    setBusyKey(group.key);
    setMsg("");
    const res = await fetch("/api/admin/streams/title-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamIds: group.streams.map((s) => s.id), suggested }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyKey("");
    if (!res.ok) {
      setMsg(typeof data.error === "string" ? data.error : "Apply failed");
      return;
    }
    setMsg(`Renamed ${data.updated ?? 0} stream(s) — FHD / HD / SD suffixes kept.`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Title Sync</h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--muted)" }}>
            Aligns UK: / alias names onto one display title per channel identity. FHD, HD, and SD stay
            separate. +1 timeshifts are not merged.
          </p>
        </div>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Tools
        </Link>
      </div>
      {msg ? (
        <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          {msg}
        </p>
      ) : null}
      {loading ? <p className="text-sm">Scanning live titles…</p> : null}
      {!loading && groups.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No alias groups found. Exact-name duplicates are handled on Remove Duplicates.
        </p>
      ) : null}
      <div className="space-y-4">
        {groups.map((group) => (
          <TitleSyncCard
            key={group.key}
            group={group}
            busy={busyKey === group.key}
            onApply={apply}
          />
        ))}
      </div>
    </div>
  );
}

function TitleSyncCard({
  group,
  busy,
  onApply,
}: {
  group: Group;
  busy: boolean;
  onApply: (group: Group, suggested: string) => void;
}) {
  const [suggested, setSuggested] = useState(group.suggested);
  return (
    <article
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {group.canonical} · {group.tier.toUpperCase()}
          </p>
          <p className="text-sm">{group.streams.length} alias names</p>
        </div>
        <button
          type="button"
          className="btn-positive text-sm px-3 py-1.5 rounded-lg"
          disabled={busy}
          onClick={() => onApply(group, suggested)}
        >
          {busy ? "Applying…" : "Sync titles"}
        </button>
      </div>
      <label className="block text-sm">
        Suggested name
        <input
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={suggested}
          onChange={(e) => setSuggested(e.target.value)}
        />
      </label>
      <ul className="text-sm space-y-1">
        {group.streams.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-2">
            <span>{s.name}</span>
            {s.categoryName ? (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {s.categoryName}
              </span>
            ) : null}
            <span className="text-xs" style={{ color: s.epgChannelId ? "var(--success)" : "var(--muted)" }}>
              {s.epgChannelId ? "EPG linked" : "No EPG"}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
