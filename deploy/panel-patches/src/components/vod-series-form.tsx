"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FormField,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { TmdbMetadataSection, emptyTmdbMeta, type TmdbMetaFields } from "@/components/tmdb-metadata-section";
import { ServerTreePicker } from "@/components/server-tree-picker";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <div className="mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

function encodeSeriesMeta(meta: Record<string, unknown>): string | null {
  return `NEXLIFY_VOD:${JSON.stringify({ v: 2, kind: "series", ...meta })}`;
}

export function VodSeriesForm({
  backHref = "/admin/content/series",
  manageLabel = "Manage Series",
}: {
  backHref?: string;
  manageLabel?: string;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [bouquetItems, setBouquetItems] = useState<DualListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    streamUrl: "",
    streamIcon: "",
    isAdult: false,
    serverIds: [] as string[],
    bouquetIds: [] as string[],
  });
  const [tmdb, setTmdb] = useState<TmdbMetaFields>(emptyTmdbMeta());

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setBouquetItems(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({ id: b.id, label: b.name }))
        )
      );
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Series name is required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: "SERIES",
        seriesName: form.name,
        seasonNum: 1,
        episodeNum: 1,
        source:
          form.streamUrl.trim() ||
          `https://panel.local/vod/series/${encodeURIComponent(form.name.trim())}`,
        categoryId: form.categoryId || null,
        streamIcon: form.streamIcon || tmdb.tmdbPoster || null,
        serverId: form.serverIds[0] || null,
        isOnDemand: true,
        vodMode: "SERIES",
        bouquetIds: form.bouquetIds,
        agentStartCmd: encodeSeriesMeta({
          isAdult: form.isAdult,
          serverIds: form.serverIds,
          bouquetIds: form.bouquetIds,
          ...tmdb,
        }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={save} className="max-w-5xl">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)",
        }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">Add Series</h1>
        <Link
          href={backHref}
          className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="border border-t-0 rounded-b-lg p-6 space-y-5"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="grid md:grid-cols-3 gap-4">
          <FormField label="Name *" required>
            <input
              required
              className={formInputClass}
              style={formInputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="Category">
            <select
              className={formSelectClass}
              style={formInputStyle}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Without category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <YesNo
            label="Is adult series"
            value={form.isAdult}
            onChange={(v) => setForm({ ...form, isAdult: v })}
          />
        </div>

        <TmdbMetadataSection
          mediaType="tv"
          meta={tmdb}
          onChange={(patch) => setTmdb((m) => ({ ...m, ...patch }))}
          onTitle={(title) => setForm((f) => ({ ...f, name: title }))}
          onPoster={(url) => setForm((f) => ({ ...f, streamIcon: url }))}
        />

        <FormField label="First episode source (optional)">
          <input
            className={formInputClass}
            style={formInputStyle}
            placeholder="URL or path for S01E01"
            value={form.streamUrl}
            onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
          />
        </FormField>

        <ServerTreePicker
          selectedIds={form.serverIds}
          onChange={(serverIds) => setForm({ ...form, serverIds })}
        />

        <div>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--muted)" }}>
            Bouquets
          </p>
          <DualListPicker
            items={bouquetItems}
            selectedIds={form.bouquetIds}
            onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
            availableTitle="Available bouquets"
            selectedTitle="In series"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} className="btn-cancel rounded px-5 py-2 text-sm font-medium">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add series"}
          </button>
        </div>
      </div>
    </form>
  );
}
