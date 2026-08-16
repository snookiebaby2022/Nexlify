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
import { StreamBouquetSection } from "@/components/stream-bouquet-section";
import { VodFormSection, VodYesNo } from "@/components/vod-form-section";
import { ProviderSourceFields } from "@/components/provider-source-fields";
import { CategorySelect } from "@/components/category-select";
import type { CategoryOptionInput } from "@/lib/category-options";

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
  const [categories, setCategories] = useState<CategoryOptionInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [useProvider, setUseProvider] = useState(false);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    streamUrl: "",
    streamIcon: "",
    isAdult: false,
    serverIds: [] as string[],
    bouquetIds: [] as string[],
    providerId: "",
    providerPath: "",
  });
  const [tmdb, setTmdb] = useState<TmdbMetaFields>(emptyTmdbMeta());

  useEffect(() => {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Series name is required.");
      return;
    }
    if (useProvider && (!form.providerId || !form.providerPath.trim())) {
      alert("Select provider and path, or paste a direct URL.");
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
        source: useProvider
          ? undefined
          : form.streamUrl.trim() ||
            `https://panel.local/vod/series/${encodeURIComponent(form.name.trim())}`,
        hostedExternally: useProvider,
        providerId: useProvider ? form.providerId : null,
        providerPath: useProvider ? form.providerPath : null,
        categoryId: form.categoryId || null,
        streamIcon: form.streamIcon || tmdb.tmdbPoster || null,
        serverId: form.serverIds[0] || null,
        isOnDemand: true,
        vodMode: "ON_DEMAND",
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
        <VodFormSection title="Series info">
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
            <CategorySelect
              className={formSelectClass}
              style={formInputStyle}
              value={form.categoryId}
              onChange={(categoryId) => setForm({ ...form, categoryId })}
              categories={categories}
              typeFilter="SERIES"
              emptyLabel="Without category"
            />
          </FormField>
          <VodYesNo
            label="Is adult series"
            value={form.isAdult}
            onChange={(v) => setForm({ ...form, isAdult: v })}
          />
        </div>
        </VodFormSection>

        <VodFormSection title="TMDB metadata">
        <TmdbMetadataSection
          mediaType="tv"
          meta={tmdb}
          onChange={(patch) => setTmdb((m) => ({ ...m, ...patch }))}
          onTitle={(title) => setForm((f) => ({ ...f, name: title }))}
          onPoster={(url) => setForm((f) => ({ ...f, streamIcon: url }))}
        />
        </VodFormSection>

        <VodFormSection title="Source & delivery">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Use a <strong>direct provider URL</strong> for the first episode, or host via a configured provider so
          playback uses that provider’s URL.
        </p>
        <ProviderSourceFields
          providerId={form.providerId}
          providerPath={form.providerPath}
          useProvider={useProvider}
          onChange={(next) => {
            setUseProvider(next.useProvider);
            setForm({ ...form, providerId: next.providerId, providerPath: next.providerPath });
          }}
        />
        {!useProvider && (
          <FormField label="Direct source URL (first episode, optional)">
            <input
              className={`${formInputClass} font-mono text-sm`}
              style={formInputStyle}
              placeholder="https://provider…/series/user/pass/1/1.mp4"
              value={form.streamUrl}
              onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
            />
          </FormField>
        )}

        <ServerTreePicker
          selectedIds={form.serverIds}
          onChange={(serverIds) => setForm({ ...form, serverIds })}
        />
        </VodFormSection>

        <VodFormSection title="Bouquets">
        <StreamBouquetSection
          selectedIds={form.bouquetIds}
          onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
          selectedTitle="In series"
        />
        </VodFormSection>

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
