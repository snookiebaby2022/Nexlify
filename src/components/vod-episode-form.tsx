"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { VodFormSection } from "@/components/vod-form-section";
import { StreamBouquetSection } from "@/components/stream-bouquet-section";

export function VodEpisodeForm({
  backHref = "/admin/content/episodes",
  initialSeriesId,
}: {
  backHref?: string;
  initialSeriesId?: string;
}) {
  const router = useRouter();
  const [series, setSeries] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    seriesId: initialSeriesId ?? "",
    season: 1,
    episode: 1,
    title: "",
    streamUrl: "",
    bouquetIds: [] as string[],
  });

  useEffect(() => {
    fetch("/api/admin/series")
      .then((r) => r.json())
      .then((d) => setSeries(d.series ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSeriesId) {
      setForm((f) => ({ ...f, seriesId: initialSeriesId }));
    }
  }, [initialSeriesId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.seriesId || !form.title.trim() || !form.streamUrl.trim()) {
      alert("Series, title, and stream URL are required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={save} className="max-w-3xl">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">Add Episode</h1>
        <Link href={backHref} className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10">
          Manage Episodes
        </Link>
      </div>
      <div className="border border-t-0 rounded-b-lg p-6 space-y-5" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <VodFormSection title="Episode details">
          <FormField label="Series" required>
            <select
              required
              className={formSelectClass}
              style={formInputStyle}
              value={form.seriesId}
              onChange={(e) => setForm({ ...form, seriesId: e.target.value })}
            >
              <option value="">Select a series</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Season" required>
              <input
                type="number"
                min={1}
                required
                className={formInputClass}
                style={formInputStyle}
                value={form.season}
                onChange={(e) => setForm({ ...form, season: parseInt(e.target.value, 10) || 1 })}
              />
            </FormField>
            <FormField label="Episode number" required>
              <input
                type="number"
                min={1}
                required
                className={formInputClass}
                style={formInputStyle}
                value={form.episode}
                onChange={(e) => setForm({ ...form, episode: parseInt(e.target.value, 10) || 1 })}
              />
            </FormField>
          </div>
          <FormField label="Episode title" required>
            <input
              required
              className={formInputClass}
              style={formInputStyle}
              placeholder="e.g. Pilot"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </FormField>
        </VodFormSection>
        <VodFormSection title="Source">
          <FormField label="Stream URL" required>
            <input
              required
              type="url"
              className={`${formInputClass} font-mono`}
              style={formInputStyle}
              placeholder="https://…/episode.mp4"
              value={form.streamUrl}
              onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
            />
          </FormField>
        </VodFormSection>
        <VodFormSection title="Bouquets">
          <StreamBouquetSection
            selectedIds={form.bouquetIds}
            onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
            selectedTitle="In episode bouquets"
          />
        </VodFormSection>
        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} className="btn-cancel rounded px-5 py-2 text-sm font-medium">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="btn-positive rounded px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-60">
            {saving ? "Saving…" : "Add episode"}
          </button>
        </div>
      </div>
    </form>
  );
}
