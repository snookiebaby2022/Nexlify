"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  return (
    <div className="max-w-5xl">
      <form onSubmit={save} className="rounded-lg border overflow-visible" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
        >
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <Link
            href={backHref}
            className="text-sm px-4 py-1.5 rounded font-medium text-white border border-white/70 hover:bg-white/10"
          >
            {manageLabel}
          </Link>
        </div>

        <div className="p-4 md:p-6 space-y-4" style={{ background: "var(--bg-card)" }}>
          <label className="block text-sm max-w-xl">
            <span className="font-medium">
              Name <span style={{ color: "#ef4444" }}>*</span>
            </span>
            <input
              required
              className="mt-1.5 w-full rounded border px-3 py-2.5 text-sm bg-white"
              style={{ borderColor: "#d1d5db", color: "#111" }}
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

          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span style={{ color: "var(--muted)" }}>Show in left list:</span>
            {(["", "LIVE", "MOVIE", "SERIES"] as const).map((t) => (
              <button
                key={t || "all"}
                type="button"
                className="text-xs px-3 py-1 rounded cursor-pointer border"
                style={{
                  background: typeFilter === t ? "#3c8dbc" : "#fff",
                  color: typeFilter === t ? "#fff" : "#374151",
                  borderColor: "#d1d5db",
                }}
                onClick={() => setTypeFilter(t)}
              >
                {t === "" ? "All" : t === "LIVE" ? "Channels" : t === "MOVIE" ? "Movies" : "Series"}
              </button>
            ))}
          </div>

          <XuiDualListPicker
            items={pickerItems}
            allItems={items}
            selectedIds={streamIds}
            onChange={setStreamIds}
          />

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {streamIds.length} stream(s) in bouquet · channel order = line playlist order ·{" "}
            {items.length} in catalog
          </p>

          <div className="flex flex-wrap gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              type="submit"
              disabled={saving}
              className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : bouquetId ? "Save bouquet" : "Add bouquet"}
            </button>
            <Link href={backHref} className="btn-cancel rounded px-6 py-2.5 text-sm font-medium inline-flex items-center">
              Cancel
            </Link>
          </div>
          {msg && <p className="text-sm" style={{ color: "var(--danger)" }}>{msg}</p>}
        </div>
      </form>
    </div>
  );
}
