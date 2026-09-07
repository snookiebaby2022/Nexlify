"use client";

import { useEffect, useState } from "react";
import { ScopeDualList } from "@/components/import-customize-fields";
import { toCsv } from "@/lib/import-scope";

type Item = { id: string; label: string };

export function ChannelRefreshScope() {
  const [providers, setProviders] = useState<Item[]>([]);
  const [bouquets, setBouquets] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Item[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [bouquetIds, setBouquetIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings?group=cron").then((r) => r.json()),
      fetch("/api/admin/stream-providers").then((r) => r.json()),
      fetch("/api/admin/bouquets").then((r) => r.json()),
      fetch("/api/admin/categories").then((r) => r.json()),
    ])
      .then(([cron, prov, bq, cats]) => {
        const s = cron?.settings ?? {};
        const split = (v: unknown) =>
          String(v ?? "")
            .split(/[\n,]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        setProviderIds(split(s.channelRefreshProviderIds));
        setBouquetIds(split(s.channelRefreshBouquetIds));
        setCategoryIds(split(s.channelRefreshCategoryIds));
        setProviders(
          (prov.providers ?? []).map((p: { id: string; name: string }) => ({
            id: p.id,
            label: p.name,
          }))
        );
        setBouquets(
          (bq.bouquets ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            label: b.name,
          }))
        );
        setCategories(
          (cats.categories ?? []).map((c: { id: string; name: string }) => ({
            id: c.id,
            label: c.name,
          }))
        );
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: "cron",
          settings: {
            channelRefreshProviderIds: toCsv(providerIds),
            channelRefreshBouquetIds: toCsv(bouquetIds),
            channelRefreshCategoryIds: toCsv(categoryIds),
          },
        }),
      });
      setMsg(res.ok ? "Saved — next channel refresh uses this scope." : "Could not save");
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "#00c0ef" }}>
          Live name updater scope
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Channel metadata refresh only updates names/logos on streams that already exist. Leave a
          list empty to include all. Example: select the PPV bouquet so only those slots rename.
        </p>
      </div>
      <ScopeDualList
        label="Providers"
        items={providers}
        selectedIds={providerIds}
        onChange={setProviderIds}
        hint="Only pull live names from these Xtream providers."
      />
      <ScopeDualList
        label="Bouquets"
        items={bouquets}
        selectedIds={bouquetIds}
        onChange={setBouquetIds}
        hint="Only rename streams already attached to these packages (e.g. PPV)."
      />
      <ScopeDualList
        label="Panel categories"
        items={categories}
        selectedIds={categoryIds}
        onChange={setCategoryIds}
        hint="Only rename streams already in these folders."
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded py-2 px-4 text-sm font-medium cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {saving ? "Saving…" : "Save updater scope"}
      </button>
      {msg ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
