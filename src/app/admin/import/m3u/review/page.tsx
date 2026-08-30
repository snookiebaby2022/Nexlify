"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Layers,
  Radio,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

type ReviewEntry = {
  id: string;
  name: string;
  url: string;
  group?: string;
  logo?: string;
  duplicateOf?: string;
  selected: boolean;
};

type ReviewResult = {
  entries: ReviewEntry[];
  duplicates: number;
  truncated: boolean;
  totalParsed: number;
  uniqueCount?: number;
  groups?: { name: string; count: number }[];
  withLogo?: number;
};

type ImportOptions = {
  autoCategory: boolean;
  autoBouquetFromGroup: boolean;
  autoAssignEpg: boolean;
  useLogos: boolean;
  onDemand: boolean;
  serverId: string;
  bouquetIds: string[];
};

const STEPS = ["Upload", "Auto setup", "Review", "Import"] as const;

export default function M3uReviewPage() {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  const [servers, setServers] = useState<{ id: string; name: string; healthStatus?: string }[]>([]);
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);

  const [opts, setOpts] = useState<ImportOptions>({
    autoCategory: true,
    autoBouquetFromGroup: true,
    autoAssignEpg: true,
    useLogos: true,
    onDemand: true,
    serverId: "",
    bouquetIds: [],
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/servers").then((r) => (r.ok ? r.json() : { servers: [] })),
      fetch("/api/admin/bouquets").then((r) => (r.ok ? r.json() : { bouquets: [] })),
    ]).then(([sData, bData]) => {
      const serverList = Array.isArray(sData.servers) ? sData.servers : [];
      const bouquetList = Array.isArray(bData.bouquets) ? bData.bouquets : [];
      setServers(serverList);
      setBouquets(bouquetList);
      const online = serverList.find(
        (s: { healthStatus?: string }) =>
          s.healthStatus === "online" || s.healthStatus === "healthy"
      );
      setOpts((prev) => ({
        ...prev,
        serverId: prev.serverId || online?.id || serverList[0]?.id || "",
        bouquetIds: prev.bouquetIds.length ? prev.bouquetIds : bouquetList.map((b: { id: string }) => b.id),
      }));
    });
  }, []);

  const loadContent = useCallback(async () => {
    if (paste.trim()) return paste;
    if (url.trim()) {
      const res = await fetch("/api/admin/import/m3u", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch URL");
      return String(data.content ?? "");
    }
    throw new Error("Provide an M3U file, URL, or pasted content");
  }, [paste, url]);

  async function handleFile(file: File) {
    setFileName(file.name);
    setPaste(await file.text());
    setUrl("");
  }

  async function parsePlaylist() {
    setMsg("");
    setBusy(true);
    try {
      const content = await loadContent();
      const res = await fetch("/api/admin/import/m3u", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      setReview(data);
      setStep(1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  function applyAutoSetup() {
    if (!review) return;
    setReview({
      ...review,
      entries: review.entries.map((e) => ({
        ...e,
        selected: !e.duplicateOf,
      })),
    });
    setStep(2);
  }

  function toggleAll(selected: boolean) {
    if (!review) return;
    setReview({
      ...review,
      entries: review.entries.map((e) => ({ ...e, selected: e.duplicateOf ? false : selected })),
    });
  }

  function toggleEntry(id: string) {
    if (!review) return;
    setReview({
      ...review,
      entries: review.entries.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e)),
    });
  }

  const filteredEntries = useMemo(() => {
    if (!review) return [];
    const q = search.trim().toLowerCase();
    return review.entries.filter((e) => {
      if (groupFilter && (e.group ?? "Uncategorized") !== groupFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.group ?? "").toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q)
      );
    });
  }, [review, search, groupFilter]);

  const selectedCount = review?.entries.filter((e) => e.selected).length ?? 0;

  async function runImport() {
    if (!review) return;
    const selectedUrls = review.entries.filter((e) => e.selected).map((e) => e.url);
    if (!selectedUrls.length) {
      setMsg("Select at least one channel to import.");
      return;
    }
    if (!opts.serverId) {
      setMsg("Assign a streaming server before import.");
      return;
    }
    setImporting(true);
    setMsg("");
    setStep(3);
    try {
      const content = paste.trim() ? paste : undefined;
      const serverName = servers.find((s) => s.id === opts.serverId)?.name ?? "server";
      const res = await fetch("/api/admin/import/m3u", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          url: url.trim() || undefined,
          selectedUrls,
          streamType: "LIVE",
          serverId: opts.serverId,
          autoCategory: opts.autoCategory,
          autoBouquetFromGroup: opts.autoBouquetFromGroup,
          autoAssignEpg: opts.autoAssignEpg,
          bouquetIds: opts.bouquetIds.length ? opts.bouquetIds : undefined,
          defaultOnDemand: opts.onDemand,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const epgNote = data.epgAssigned ? ` · EPG matched ${data.epgAssigned}` : "";
      const modeNote = opts.onDemand ? " · on-demand" : " · 24/7 live";
      setMsg(
        `Imported ${data.imported} channel(s), skipped ${data.skipped ?? 0}${epgNote}${modeNote} on ${serverName}. Icons and categories were applied from the playlist.`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Import wizard</p>
          <h1 className="text-lg font-semibold text-white">M3U Stream Review</h1>
        </div>
        <Link
          href="/admin/import/m3u"
          className="text-sm px-4 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
        >
          Quick import
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background: i === step ? "var(--accent)" : i < step ? "rgba(34,197,94,0.15)" : "var(--bg-card)",
              color: i === step ? "#fff" : i < step ? "#22c55e" : "var(--muted)",
              border: i === step ? "none" : "1px solid var(--border)",
            }}
          >
            <span>{i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {msg && (
        <p
          className="text-sm px-3 py-2 rounded border"
          style={{
            borderColor: "var(--border)",
            color: msg.startsWith("Imported") ? "#22c55e" : "var(--muted)",
          }}
        >
          {msg}
        </p>
      )}

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Upload a playlist file, paste content, or fetch from URL. Next you will configure automatic EPG, icons,
            server, bouquets, and categories.
          </p>

          <div
            className="rounded-xl border-2 border-dashed p-8 text-center transition-colors"
            style={{
              borderColor: dragOver ? "var(--accent)" : "var(--border)",
              background: dragOver ? "rgba(0,192,239,0.06)" : "var(--bg-card)",
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
          >
            <FileUp size={32} className="mx-auto mb-3" style={{ color: "var(--accent)" }} />
            <p className="text-sm font-medium">Drop M3U / M3U8 file here</p>
            <label className="inline-block mt-3 cursor-pointer rounded px-4 py-2 text-sm text-white" style={{ background: "var(--accent)" }}>
              Choose file
              <input
                type="file"
                accept=".m3u,.m3u8,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            {fileName && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Loaded: {fileName}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <label className="block text-sm font-medium">M3U URL</label>
              <input
                className="w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="https://example.com/playlist.m3u"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (e.target.value) setPaste("");
                }}
              />
            </div>
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <label className="block text-sm font-medium">Or paste M3U content</label>
              <textarea
                className="w-full rounded border px-3 py-2 bg-transparent text-sm font-mono min-h-[100px]"
                style={{ borderColor: "var(--border)" }}
                placeholder="#EXTM3U&#10;#EXTINF:-1,Channel..."
                value={paste}
                onChange={(e) => {
                  setPaste(e.target.value);
                  if (e.target.value) setUrl("");
                }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={busy || (!paste.trim() && !url.trim())}
            onClick={() => void parsePlaylist()}
            className="inline-flex items-center gap-2 rounded px-5 py-2.5 text-sm font-medium disabled:opacity-50 text-white"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Parsing…" : "Continue"}
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {step === 1 && review && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Parsed", value: review.totalParsed, icon: Radio },
              { label: "Categories", value: review.groups?.length ?? 0, icon: Layers },
              { label: "With logos", value: review.withLogo ?? 0, icon: Sparkles },
              { label: "Duplicates", value: review.duplicates, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <Icon size={14} />
                  {label}
                </div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <h2 className="text-sm font-semibold">Automatic setup (recommended)</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              These options run when you import. Categories are created from group-title; bouquets mirror groups; EPG is
              auto-matched; channel logos come from tvg-logo in the M3U.
            </p>

            <div className="grid md:grid-cols-2 gap-3 text-sm">
              {[
                { key: "autoCategory" as const, label: "Create categories from group-title" },
                { key: "autoBouquetFromGroup" as const, label: "Create/link bouquets from groups" },
                { key: "autoAssignEpg" as const, label: "Auto-match EPG after import" },
                { key: "useLogos" as const, label: "Apply channel icons from playlist" },
                { key: "onDemand" as const, label: "On-demand — start only when a viewer watches" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opts[key]}
                    onChange={(e) => setOpts({ ...opts, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="block text-sm">
              <span className="font-medium">Assign streaming server</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 panel-select bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={opts.serverId}
                onChange={(e) => setOpts({ ...opts, serverId: e.target.value })}
                required
              >
                <option value="">— Select server —</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.healthStatus ? ` (${s.healthStatus})` : ""}
                  </option>
                ))}
              </select>
              {!opts.serverId ? (
                <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                  Required — every imported stream is assigned to this server.
                </p>
              ) : (
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {opts.onDemand
                    ? "On-demand: the agent starts the stream on this server when the first client connects."
                    : "24/7: the stream stays running on this server after import."}
                </p>
              )}
            </label>

            {bouquets.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Attach to bouquets</span>
                <div className="mt-2 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {bouquets.map((b) => (
                    <label key={b.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.bouquetIds.includes(b.id)}
                        onChange={(e) => {
                          setOpts({
                            ...opts,
                            bouquetIds: e.target.checked
                              ? [...opts.bouquetIds, b.id]
                              : opts.bouquetIds.filter((id) => id !== b.id),
                          });
                        }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {review.groups && review.groups.length > 0 && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                <span className="font-medium text-sm" style={{ color: "inherit" }}>
                  Groups detected:{" "}
                </span>
                {review.groups.slice(0, 8).map((g) => `${g.name} (${g.count})`).join(" · ")}
                {review.groups.length > 8 ? ` · +${review.groups.length - 8} more` : ""}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-4 py-2 text-sm border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setStep(0)}
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded px-5 py-2 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
              onClick={applyAutoSetup}
            >
              Review channels
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && review && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <input
                className="w-full rounded border pl-9 pr-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="Search channels…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded border px-3 py-2 panel-select bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {(review.groups ?? []).map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <button type="button" className="text-xs underline" onClick={() => toggleAll(true)}>
              Select non-dupes
            </button>
            <button type="button" className="text-xs underline" onClick={() => toggleAll(false)}>
              Clear all
            </button>
          </div>

          <div
            className="rounded-lg border overflow-x-auto max-h-[55vh] overflow-y-auto"
            style={{ borderColor: "var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "rgba(0,192,239,0.15)" }}>
                <tr>
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2 text-left w-10">Icon</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Group</th>
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t"
                    style={{
                      borderColor: "var(--border)",
                      background: e.duplicateOf ? "rgba(245,158,11,0.08)" : undefined,
                    }}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={e.selected} onChange={() => toggleEntry(e.id)} />
                    </td>
                    <td className="px-3 py-2">
                      {e.logo ? (
                        <img src={e.logo} alt="" className="w-8 h-8 rounded object-cover bg-black/20" />
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{e.name}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {e.group ?? "Uncategorized"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono max-w-[240px] truncate" title={e.url}>
                      {e.url}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.duplicateOf ? (
                        <span className="text-amber-400">Duplicate</span>
                      ) : (
                        <span className="text-green-400">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {review.truncated && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Showing first 500 entries of {review.totalParsed} parsed.
            </p>
          )}

          <div
            className="rounded-lg border p-4 grid md:grid-cols-2 gap-3"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <label className="block text-sm">
              <span className="font-medium">Assign server</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 panel-select bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={opts.serverId}
                onChange={(e) => setOpts({ ...opts, serverId: e.target.value })}
              >
                <option value="">— Select server —</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.healthStatus ? ` (${s.healthStatus})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
              <input
                type="checkbox"
                checked={opts.onDemand}
                onChange={(e) => setOpts({ ...opts, onDemand: e.target.checked })}
              />
              On-demand (start when watched)
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-4 py-2 text-sm border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setStep(1)}
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <button
              type="button"
              disabled={importing || selectedCount === 0 || !opts.serverId}
              onClick={() => void runImport()}
              className="inline-flex items-center gap-2 rounded px-5 py-2 text-sm font-medium disabled:opacity-50 text-white"
              style={{ background: "#22c55e" }}
            >
              <Upload size={16} />
              {importing ? "Importing…" : `Import ${selectedCount} channel(s)`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-lg border p-8 text-center space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          {importing ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Importing channels and running EPG match…
            </p>
          ) : msg.startsWith("Imported") ? (
            <>
              <CheckCircle2 size={48} className="mx-auto text-green-400" />
              <p className="text-sm font-medium">{msg}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <Link href="/admin/content/streams" className="rounded px-4 py-2 text-sm text-white" style={{ background: "var(--accent)" }}>
                  View streams
                </Link>
                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm border"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => {
                    setStep(0);
                    setReview(null);
                    setPaste("");
                    setUrl("");
                    setFileName("");
                    setMsg("");
                  }}
                >
                  Import another playlist
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {msg || "Import failed"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
