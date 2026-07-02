"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, Upload } from "lucide-react";

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
};

export default function M3uReviewPage() {
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");

  async function runReview(source: "url" | "paste") {
    setMsg("");
    setBusy(true);
    const body =
      source === "url" ? { action: "review", url: url.trim() } : { action: "review", content: paste };
    const res = await fetch("/api/admin/import/m3u", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Review failed");
      return;
    }
    setReview(data);
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

  async function importSelected() {
    if (!review) return;
    const selectedUrls = review.entries.filter((e) => e.selected).map((e) => e.url);
    if (!selectedUrls.length) {
      setMsg("Select at least one channel to import.");
      return;
    }
    setImporting(true);
    setMsg("");
    const res = await fetch("/api/admin/import/m3u", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: paste || undefined,
        url: url.trim() || undefined,
        selectedUrls,
        autoCategory: true,
      }),
    });
    setImporting(false);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Import failed");
      return;
    }
    setMsg(`Imported ${data.imported} channel(s), skipped ${data.skipped ?? 0}.`);
  }

  const selectedCount = review?.entries.filter((e) => e.selected).length ?? 0;

  return (
    <div className="space-y-4 max-w-6xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Import</p>
          <h1 className="text-lg font-semibold text-white">M3U Stream Review</h1>
        </div>
        <Link
          href="/admin/import/m3u"
          className="text-sm px-4 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
        >
          Quick import
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Preview playlist entries, detect duplicate names/URLs, then import only the channels you want.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <label className="block text-sm font-medium">M3U URL</label>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            placeholder="https://example.com/playlist.m3u"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !url.trim()}
            onClick={() => runReview("url")}
            className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Eye size={16} />
            {busy ? "Reviewing…" : "Review URL"}
          </button>
        </div>

        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <label className="block text-sm font-medium">Paste M3U content</label>
          <textarea
            className="w-full rounded border px-3 py-2 bg-transparent text-sm font-mono min-h-[120px]"
            style={{ borderColor: "var(--border)" }}
            placeholder="#EXTM3U&#10;#EXTINF:-1,Channel..."
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !paste.trim()}
            onClick={() => runReview("paste")}
            className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Eye size={16} />
            {busy ? "Reviewing…" : "Review paste"}
          </button>
        </div>
      </div>

      {msg && (
        <p className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          {msg}
        </p>
      )}

      {review && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={14} className="text-green-400" />
              {review.totalParsed} parsed
            </span>
            {review.duplicates > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle size={14} />
                {review.duplicates} duplicate(s) flagged
              </span>
            )}
            {review.truncated && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Showing first 500 entries
              </span>
            )}
            <span className="ml-auto font-medium">{selectedCount} selected</span>
            <button type="button" className="text-xs underline" onClick={() => toggleAll(true)}>
              Select non-dupes
            </button>
            <button type="button" className="text-xs underline" onClick={() => toggleAll(false)}>
              Clear all
            </button>
            <button
              type="button"
              disabled={importing || selectedCount === 0}
              onClick={importSelected}
              className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "#22c55e", color: "#fff" }}
            >
              <Upload size={16} />
              {importing ? "Importing…" : "Import selected"}
            </button>
          </div>

          <div className="rounded-lg border overflow-x-auto max-h-[60vh] overflow-y-auto" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "rgba(0,192,239,0.15)" }}>
                <tr>
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Group</th>
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {review.entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t"
                    style={{
                      borderColor: "var(--border)",
                      background: e.duplicateOf ? "rgba(245,158,11,0.08)" : undefined,
                      opacity: e.selected ? 1 : 0.65,
                    }}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={e.selected} onChange={() => toggleEntry(e.id)} />
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{e.name}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                      {e.group ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono max-w-[280px] truncate" title={e.url}>
                      {e.url}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.duplicateOf ? (
                        <span className="text-amber-400">Duplicate</span>
                      ) : (
                        <span className="text-green-400">Unique</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
