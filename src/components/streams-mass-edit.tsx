"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProgressBar, useProgress } from "@/components/progress-bar";
import { CategorySelect } from "@/components/category-select";
import { categoryTypeForStream, type CategoryOptionInput } from "@/lib/category-options";

const PAGE_SIZES = [10, 25, 50, 100] as const;

type Stream = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  vodMode?: string;
};

export function StreamsMassEdit({
  title,
  description,
  typeFilter,
  episodesOnly,
  radioOnly,
}: {
  title: string;
  description: string;
  typeFilter?: "LIVE" | "MOVIE" | "SERIES";
  episodesOnly?: boolean;
  radioOnly?: boolean;
}) {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryOptionInput[]>([]);
  const [action, setAction] = useState("disable");
  const [categoryId, setCategoryId] = useState("");
  const [minSpeed, setMinSpeed] = useState("");
  const [maxSpeed, setMaxSpeed] = useState("");
  const [clearSpeed, setClearSpeed] = useState(false);
  const [vodMode, setVodMode] = useState("LIVE");
  const [archiveDays, setArchiveDays] = useState("");
  const [backupUrl, setBackupUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const progress = useProgress();



  const loadStreams = useCallback(() => {

    const params = new URLSearchParams();

    if (typeFilter) params.set("type", typeFilter);

    if (radioOnly) params.set("radio", "1");

    const q = params.toString() ? `?${params.toString()}` : "";

    fetch(`/api/admin/streams${q}`)

      .then((r) => r.json())

      .then((d) => {

        let list: Stream[] = d.streams ?? [];

        if (episodesOnly) {

          list = list.filter((s) => s.episodeNum != null || s.name.match(/S\d+E\d+/i));

        }

        setStreams(list);

      });

  }, [typeFilter, episodesOnly, radioOnly]);



  useEffect(() => {

    loadStreams();

    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories));

  }, [loadStreams]);

  const filtered = useMemo(() => {
    if (!search.trim()) return streams;
    const q = search.toLowerCase();
    return streams.filter((s) => s.name.toLowerCase().includes(q));
  }, [streams, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length entriesSize));
  const paged = useMemo(() => {
    return filtered.slice((page - 1) * pageSize, page * pageSize);
  }, [filtered, page, pageSize]);

  const allOnPageSelected = paged.length > 0 && paged.every((s) => selected.has(s.id));

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function toggleAll() {
    const n = new Set(selected);
    if (allOnPageSelected) {
      paged.forEach((s) => n.delete(s.id));
    } else {
      paged.forEach((s) => n.add(s.id));
    }
    setSelected(n);
  }

  function selectAll() {
    setSelected(new Set(filtered.map((s) => s.id)));
  }



  async function apply() {
    if (!selected.size) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} items?`)) return;

    if (action === "setSpeed") {

      const min = minSpeed.trim() === "" ? (clearSpeed ? null : undefined) : Number(minSpeed);

      const max = maxSpeed.trim() === "" ? (clearSpeed ? null : undefined) : Number(maxSpeed);

      if (min === undefined && max === undefined) {

        setMsg("Enter min and/or max speed (Kbps), or check “Clear limits”");

        return;

      }

      if (

        (typeof min === "number" && typeof max === "number" && min > max) ||

        (typeof min === "number" && Number.isNaN(min)) ||

        (typeof max === "number" && Number.isNaN(max))

      ) {

        setMsg("Invalid speed values — min must be ≤ max");

        return;

      }

    }



    if (action === "setBackupUrl" && !backupUrl.trim()) {

      setMsg("Enter a backup URL");

      return;

    }



    setMsg("");
    progress.start(selected.size, `Processing ${action}…`);

    const res = await fetch("/api/admin/streams/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [...selected],
        action,
        categoryId: action === "setCategory" ? categoryId || null : undefined,
        vodMode: action === "setVodMode" ? vodMode : undefined,
        archiveDays: action === "setVodMode" && archiveDays ? Number(archiveDays) : undefined,
        minSpeedKbps:
          action === "setSpeed"
            ? clearSpeed && minSpeed.trim() === ""
              ? null
              : minSpeed.trim() === ""
                ? undefined
                : Number(minSpeed)
            : undefined,
        maxSpeedKbps:
          action === "setSpeed"
            ? clearSpeed && maxSpeed.trim() === ""
              ? null
              : maxSpeed.trim() === ""
                ? undefined
                : Number(maxSpeed)
            : undefined,
        backupUrl: action === "setBackupUrl" ? backupUrl.trim() : undefined,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      progress.finish();
      setMsg(`Updated ${data.count} items`);
    } else {
      progress.error(data.error ?? "Failed");
      setMsg(data.error ?? "Failed");
    }

    setSelected(new Set());
    loadStreams();
  }



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap gap-3 items-center">

        <h1 className="text-2xl font-semibold flex-1">{title}</h1>

        <Link href="/admin/management/mass-edit" className="text-sm" style={{ color: "var(--accent)" }}>

          ← Mass edit

        </Link>

      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>{description}</p>

      <div className="flex flex-wrap gap-3 items-end">

        <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={action} onChange={(e) => setAction(e.target.value)}>

          <option value="enable">Enable</option>

          <option value="disable">Disable</option>

          <option value="delete">Delete</option>

          <option value="setCategory">Set category</option>

          <option value="setSpeed">Set min/max speed (Kbps)</option>

          {typeFilter === "LIVE" && <option value="setVodMode">Set on-demand mode</option>}

          {typeFilter === "LIVE" && <option value="setBackupUrl">Set backup URL</option>}

          {typeFilter === "LIVE" && <option value="clearBackupUrl">Clear backup URL</option>}

        </select>

        {action === "setCategory" && (
          <CategorySelect
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={categoryId}
            onChange={setCategoryId}
            categories={categories}
            typeFilter={
              radioOnly ? "RADIO" : typeFilter ? categoryTypeForStream(typeFilter) : null
            }
            emptyLabel="—"
          />
        )}

        {action === "setVodMode" && (

          <>

            <select

              className="rounded border px-3 py-2 bg-transparent"

              style={{ borderColor: "var(--border)" }}

              value={vodMode}

              onChange={(e) => setVodMode(e.target.value)}

            >

              <option value="LIVE">Live only</option>

              <option value="ON_DEMAND">On demand</option>

              <option value="CATCHUP">Catch-up</option>

            </select>

            {vodMode === "CATCHUP" && (

              <input

                type="number"

                min={1}

                placeholder="Archive days"

                className="rounded border px-3 py-2 bg-transparent w-32"

                style={{ borderColor: "var(--border)" }}

                value={archiveDays}

                onChange={(e) => setArchiveDays(e.target.value)}

              />

            )}

          </>

        )}

        {action === "setSpeed" && (

          <>

            <input

              type="number"

              min={0}

              placeholder="Min Kbps (empty = no change)"

              className="rounded border px-3 py-2 bg-transparent w-40"

              style={{ borderColor: "var(--border)" }}

              value={minSpeed}

              onChange={(e) => setMinSpeed(e.target.value)}

            />

            <input

              type="number"

              min={0}

              placeholder="Max Kbps (empty = no change)"

              className="rounded border px-3 py-2 bg-transparent w-40"

              style={{ borderColor: "var(--border)" }}

              value={maxSpeed}

              onChange={(e) => setMaxSpeed(e.target.value)}

            />

            <label className="flex items-center gap-2 text-sm cursor-pointer">

              <input

                type="checkbox"

                checked={clearSpeed}

                onChange={(e) => setClearSpeed(e.target.checked)}

              />

              Clear empty fields (remove limits)

            </label>

          </>

        )}

        {action === "setBackupUrl" && (

          <input

            type="url"

            placeholder="https://backup.example/channel.m3u8"

            className="rounded border px-3 py-2 bg-transparent min-w-[280px]"

            style={{ borderColor: "var(--border)" }}

            value={backupUrl}

            onChange={(e) => setBackupUrl(e.target.value)}

          />

        )}

        <button type="button" onClick={apply} className="rounded px-4 py-2 cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>

          Apply to {selected.size || "…"} selected

        </button>

      </div>

      {msg && <p className="text-sm">{msg}</p>}

      <ProgressBar progress={progress} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search streams…"
          className="rounded border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} entries</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {selected.size} selected · {filtered.length} total
        </span>
        {selected.size < filtered.length && (
          <button type="button" onClick={selectAll} className="text-xs px-2 py-1 rounded border cursor-pointer" style={{ borderColor: "var(--border)" }}>
            Select all {filtered.length}
          </button>
        )}
      </div>

      <div className="rounded-lg border overflow-auto max-h-[60vh]" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} />
              </th>

              <th className="text-left p-3">Name</th>

              <th className="text-left p-3">Type</th>

              <th className="text-left p-3">Mode</th>

              <th className="text-left p-3">Status</th>

            </tr>

          </thead>

          <tbody>

            {paged.map((s) => (

              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>

                <td className="p-3">

                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />

                </td>

                <td className="p-3">

                  {s.name}

                  {s.seriesName && (

                    <span className="block text-xs" style={{ color: "var(--muted)" }}>

                      {s.seriesName} S{s.seasonNum ?? "?"} E{s.episodeNum ?? "?"}

                    </span>

                  )}

                </td>

                <td className="p-3">{s.type}</td>

                <td className="p-3">{s.vodMode && s.vodMode !== "LIVE" ? s.vodMode : "—"}</td>

                <td className="p-3">{s.isActive ? "Active" : "Off"}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>«</button>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>‹</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>›</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>»</button>
          </div>
        </div>
      )}

    </div>

  );

}

