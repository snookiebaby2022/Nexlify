"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

type DuplicateKind = "movies" | "series" | "live";
type DuplicateReason = "url" | "title" | "episode";

type DuplicateMember = {
  id: string;
  name: string;
  streamUrl: string;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
  isActive: boolean;
  categoryName: string | null;
  bouquetCount: number;
  createdAt: string;
  keepSuggested: boolean;
};

type DuplicateGroup = {
  key: string;
  reason: DuplicateReason;
  label: string;
  keepId: string;
  members: DuplicateMember[];
};

const REASON_LABEL: Record<DuplicateReason, string> = {
  url: "Same URL",
  title: "Same title",
  episode: "Same episode",
};

export default function RemoveDuplicatesPage() {
  const [kind, setKind] = useState<DuplicateKind>("movies");
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanned, setScanned] = useState(0);
  const [extraCopies, setExtraCopies] = useState(0);
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  const [scannedKind, setScannedKind] = useState<DuplicateKind | null>(null);

  const scan = useCallback(async (nextKind: DuplicateKind) => {
    setLoading(true);
    setMsg("");
    setKind(nextKind);
    try {
      const res = await fetch(`/api/admin/streams/duplicates?kind=${nextKind}`);
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Scan failed");
        setGroups([]);
        setKeepByGroup({});
        setSelected(new Set());
        return;
      }
      const nextGroups = (data.groups ?? []) as DuplicateGroup[];
      const keep: Record<string, string> = {};
      const del = new Set<string>();
      for (const group of nextGroups) {
        keep[group.key] = group.keepId;
        for (const member of group.members) {
          if (member.id !== group.keepId) del.add(member.id);
        }
      }
      setGroups(nextGroups);
      setKeepByGroup(keep);
      setSelected(del);
      setScanned(data.scanned ?? 0);
      setExtraCopies(data.extraCopies ?? 0);
      setScannedKind(nextKind);
    } catch {
      setMsg("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  function setKeep(groupKey: string, id: string) {
    const prevKeep = keepByGroup[groupKey];
    setKeepByGroup((cur) => ({ ...cur, [groupKey]: id }));
    setSelected((cur) => {
      const next = new Set(cur);
      if (prevKeep) next.add(prevKeep);
      next.delete(id);
      return next;
    });
  }

  function toggleDelete(groupKey: string, id: string) {
    if (keepByGroup[groupKey] === id) return;
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllExtras() {
    const next = new Set<string>();
    for (const group of groups) {
      const keepId = keepByGroup[group.key] ?? group.keepId;
      for (const member of group.members) {
        if (member.id !== keepId) next.add(member.id);
      }
    }
    setSelected(next);
  }

  async function removeSelected() {
    if (!selected.size) return;
    const noun =
      scannedKind === "series"
        ? "series/episode"
        : scannedKind === "live"
          ? "live stream"
          : "movie";
    if (
      !confirm(
        `Permanently delete ${selected.size.toLocaleString()} duplicate ${noun} stream(s)?\n\nThe copy marked Keep in each group will stay.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Delete failed");
        return;
      }
      setMsg(`Deleted ${data.deleted ?? 0} duplicate stream(s).`);
      await scan(kind);
    } catch {
      setMsg("Network error");
    } finally {
      setDeleting(false);
    }
  }

  const selectedCount = selected.size;
  const empty = scannedKind && !loading && groups.length === 0;

  const summary = useMemo(() => {
    if (!scannedKind) return null;
    const label =
      scannedKind === "movies" ? "movies" : scannedKind === "live" ? "live streams" : "series and episodes";
    return `${scanned.toLocaleString()} ${label} scanned · ${groups.length.toLocaleString()} duplicate groups · ${extraCopies.toLocaleString()} extra copies`;
  }, [scannedKind, scanned, groups.length, extraCopies]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap gap-3 items-start">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-semibold">Remove duplicates</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Scan movies, TV series/episodes, or live streams by URL/title, review each group, then delete
            extras. Suggested keep is the copy in the most bouquets, then categorized, then oldest.
          </p>
        </div>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Tools
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => scan("movies")}
          disabled={loading || deleting}
          className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{
            background: kind === "movies" ? "var(--accent)" : "transparent",
            color: kind === "movies" ? "#fff" : "inherit",
            border: "1px solid var(--border)",
          }}
        >
          {loading && kind === "movies" ? "Scanning…" : "Scan movies"}
        </button>
        <button
          type="button"
          onClick={() => scan("series")}
          disabled={loading || deleting}
          className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{
            background: kind === "series" ? "var(--accent)" : "transparent",
            color: kind === "series" ? "#fff" : "inherit",
            border: "1px solid var(--border)",
          }}
        >
          {loading && kind === "series" ? "Scanning…" : "Scan TV series / episodes"}
        </button>
        <button
          type="button"
          onClick={() => scan("live")}
          disabled={loading || deleting}
          className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{
            background: kind === "live" ? "var(--accent)" : "transparent",
            color: kind === "live" ? "#fff" : "inherit",
            border: "1px solid var(--border)",
          }}
        >
          {loading && kind === "live" ? "Scanning…" : "Scan live streams"}
        </button>
      </div>

      {summary && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {summary}
        </p>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={selectAllExtras}
            className="text-xs rounded px-3 py-1.5 border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Select all extras
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs rounded px-3 py-1.5 border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Clear selection
          </button>
          <button
            type="button"
            disabled={!selectedCount || deleting}
            onClick={removeSelected}
            className="text-xs rounded px-3 py-1.5 cursor-pointer disabled:opacity-50"
            style={{ background: "#b91c1c", color: "#fff" }}
          >
            {deleting ? "Deleting…" : `Delete ${selectedCount.toLocaleString()} selected`}
          </button>
        </div>
      )}

      {empty && (
        <p className="text-sm rounded-lg border px-3 py-3" style={{ borderColor: "var(--border)" }}>
          No duplicates found for this scan.
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const keepId = keepByGroup[group.key] ?? group.keepId;
          return (
            <section
              key={group.key}
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div
                className="px-3 py-2 flex flex-wrap gap-2 items-center border-b text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)" }}>
                  {REASON_LABEL[group.reason]}
                </span>
                <span className="font-medium flex-1 min-w-[140px] break-all">{group.label}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {group.members.length} copies
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                      <th className="px-3 py-2">Keep</th>
                      <th className="px-3 py-2">Delete</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Bouquets</th>
                      <th className="px-3 py-2">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.map((member) => {
                      const isKeep = member.id === keepId;
                      return (
                        <tr key={member.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name={`keep-${group.key}`}
                              checked={isKeep}
                              onChange={() => setKeep(group.key, member.id)}
                              aria-label={`Keep ${member.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(member.id)}
                              disabled={isKeep}
                              onChange={() => toggleDelete(group.key, member.id)}
                              aria-label={`Delete ${member.name}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Link href={`/admin/servers/streams?edit=${member.id}`} className="underline">
                              {member.name}
                            </Link>
                            {!member.isActive && (
                              <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                                inactive
                              </span>
                            )}
                            <div className="text-xs break-all mt-0.5" style={{ color: "var(--muted)" }}>
                              {member.streamUrl}
                            </div>
                          </td>
                          <td className="px-3 py-2">{member.categoryName ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{member.bouquetCount}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(member.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
