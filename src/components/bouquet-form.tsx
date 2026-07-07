"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Plus, Minus, ChevronUp, ChevronDown } from "lucide-react";
import type { DualListItem } from "@/components/dual-list-picker";
import { XuiDualListPicker } from "@/components/xui-dual-list-picker";

export function BouquetForm({
  bouquetId,
  title,
  backHref = "/admin/bouquets",
  manageLabel = "Manage Bouquets",
}: {
  bouquetId?: string;
  title: string;
  backHref?: string;
  manageLabel?: string;
}) {
  const [name, setName] = useState("");
  const [streamIds, setStreamIds] = useState<string[]>([]);
  const [items, setItems] = useState<DualListItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<"" | "LIVE" | "MOVIE" | "SERIES">("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(!!bouquetId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/streams?picker=1")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }, []);

  const pickerItems = typeFilter ? items.filter((i) => i.sublabel === typeFilter) : items;

  useEffect(() => {
    if (!bouquetId) return;
    fetch(`/api/admin/bouquets?id=${bouquetId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.bouquet) {
          setName(d.bouquet.name);
          setStreamIds(d.streamIds ?? []);
        }
        setLoading(false);
      });
  }, [bouquetId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/bouquets", {
      method: bouquetId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bouquetId,
        name,
        streamIds,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    window.location.href = backHref;
  }

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading bouquet…</p>;
  }

  const liveCount = streamIds.filter((id) => items.find((i) => i.id === id)?.sublabel === "LIVE").length;
  const movieCount = streamIds.filter((id) => items.find((i) => i.id === id)?.sublabel === "MOVIE").length;
  const seriesCount = streamIds.filter((id) => items.find((i) => i.id === id)?.sublabel === "SERIES").length;

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,192,239,0.15)" }}>
            <Package size={20} style={{ color: "#00c0ef" }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {bouquetId ? "Edit bouquet contents and order" : "Create a new bouquet and assign streams"}
            </p>
          </div>
        </div>
        <Link
          href={backHref}
          className="text-sm px-4 py-2 rounded border font-medium"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          {manageLabel}
        </Link>
      </div>

      <form onSubmit={save} className="space-y-4">
        {/* Name + Stats */}
        <div className="rounded-lg border p-4 md:p-5 space-y-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium mb-1.5 block">
                Bouquet name <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                required
                className="w-full rounded border px-3 py-2.5 text-sm bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Premium UK, Sports Pack"
                list="bouquet-name-suggestions"
              />
              <datalist id="bouquet-name-suggestions">
                {items.slice(0, 20).map((i) => (
                  <option key={i.id} value={i.label} />
                ))}
              </datalist>
            </label>

            <div className="flex flex-wrap gap-3 items-end">
              <div className="rounded-lg border px-3 py-2 text-center min-w-[80px]" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.1)" }}>
                <p className="text-lg font-bold tabular-nums">{streamIds.length}</p>
                <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>Total</p>
              </div>
              {liveCount > 0 && (
                <div className="rounded-lg border px-3 py-2 text-center min-w-[80px]" style={{ borderColor: "var(--border)", background: "rgba(34,197,94,0.05)" }}>
                  <p className="text-lg font-bold tabular-nums text-green-400">{liveCount}</p>
                  <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>Live</p>
                </div>
              )}
              {movieCount > 0 && (
                <div className="rounded-lg border px-3 py-2 text-center min-w-[80px]" style={{ borderColor: "var(--border)", background: "rgba(59,130,246,0.05)" }}>
                  <p className="text-lg font-bold tabular-nums text-blue-400">{movieCount}</p>
                  <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>Movies</p>
                </div>
              )}
              {seriesCount > 0 && (
                <div className="rounded-lg border px-3 py-2 text-center min-w-[80px]" style={{ borderColor: "var(--border)", background: "rgba(168,85,247,0.05)" }}>
                  <p className="text-lg font-bold tabular-nums text-purple-400">{seriesCount}</p>
                  <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>Series</p>
                </div>
              )}
              <div className="rounded-lg border px-3 py-2 text-center min-w-[80px]" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.1)" }}>
                <p className="text-lg font-bold tabular-nums">{items.length}</p>
                <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>Catalog</p>
              </div>
            </div>
          </div>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium mr-1" style={{ color: "var(--muted)" }}>Show:</span>
          {(["", "LIVE", "MOVIE", "SERIES"] as const).map((t) => (
            <button
              key={t || "all"}
              type="button"
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              style={{
                background: typeFilter === t ? "#3c8dbc" : "transparent",
                color: typeFilter === t ? "#fff" : "var(--muted)",
                border: `1px solid ${typeFilter === t ? "#3c8dbc" : "var(--border)"}`,
              }}
              onClick={() => setTypeFilter(t)}
            >
              {t === "" ? "All" : t === "LIVE" ? "Channels" : t === "MOVIE" ? "Movies" : "Series"}
            </button>
          ))}
          <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
            {pickerItems.length} available
          </span>
        </div>

        {/* Dual list picker */}
        <XuiDualListPicker
          items={pickerItems}
          allItems={items}
          selectedIds={streamIds}
          onChange={setStreamIds}
        />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded px-6 py-2.5 font-medium cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {saving ? "Saving…" : bouquetId ? "Save bouquet" : "Add bouquet"}
            </button>
            <Link href={backHref} className="rounded px-6 py-2.5 text-sm font-medium inline-flex items-center border" style={{ borderColor: "var(--border)" }}>
              Cancel
            </Link>
          </div>
          {msg && <p className="text-sm" style={{ color: msg.includes("failed") || msg.includes("error") ? "var(--danger)" : "#22c55e" }}>{msg}</p>}
        </div>
      </form>
    </div>
  );
}
