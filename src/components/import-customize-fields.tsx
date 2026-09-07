"use client";

import { DualListPicker } from "@/components/dual-list-picker";
import { StreamBouquetSection } from "@/components/stream-bouquet-section";

export type ImportCustomizeValue = {
  bouquetIds: string[];
  groupFilter: string;
  autoCategory: boolean;
  autoBouquet: boolean;
  updateNames: boolean;
  overwriteCategories: boolean;
  onDemand: boolean;
  createMissing: boolean;
  removeDuplicates: boolean;
  isAdult: boolean;
  autoTmdb?: boolean;
  autoAssignEpg?: boolean;
};

export function ImportCustomizeFields({
  value,
  onChange,
  showTmdb,
  showEpg,
}: {
  value: ImportCustomizeValue;
  onChange: (next: ImportCustomizeValue) => void;
  showTmdb?: boolean;
  showEpg?: boolean;
}) {
  const set = (patch: Partial<ImportCustomizeValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Only these playlist groups / categories
        </span>
        <textarea
          rows={3}
          placeholder={"PPV\nUK Sports\nESPN PLUS\n\nEmpty = import every group in the playlist"}
          className="w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
          style={{ borderColor: "var(--border)" }}
          value={value.groupFilter}
          onChange={(e) => set({ groupFilter: e.target.value })}
        />
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Matches M3U <code>group-title</code> (one per line or comma-separated). Use this to sync only
          PPV, or only UK Sports, without touching the rest of the catalog.
        </p>
      </label>

      <StreamBouquetSection
        selectedIds={value.bouquetIds}
        onChange={(bouquetIds) => set({ bouquetIds })}
        availableTitle="Available bouquets"
        selectedTitle="Attach imported streams to"
      />

      <div className="grid md:grid-cols-2 gap-2 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.createMissing}
            onChange={(e) => set({ createMissing: e.target.checked })}
          />
          Add new streams from the playlist
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.updateNames}
            onChange={(e) => set({ updateNames: e.target.checked })}
          />
          Update names, logos, and EPG on existing URLs
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.autoCategory}
            onChange={(e) => set({ autoCategory: e.target.checked })}
          />
          Create categories from group-title
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.overwriteCategories}
            onChange={(e) => set({ overwriteCategories: e.target.checked })}
          />
          Overwrite existing stream folders
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.autoBouquet}
            onChange={(e) => set({ autoBouquet: e.target.checked })}
          />
          Create/sync bouquets from group-title
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.onDemand}
            onChange={(e) => set({ onDemand: e.target.checked })}
          />
          Import live as on-demand
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.removeDuplicates}
            onChange={(e) => set({ removeDuplicates: e.target.checked })}
          />
          Remove exact-name copies in this playlist
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.isAdult}
            onChange={(e) => set({ isAdult: e.target.checked })}
          />
          Mark imported content as adult
        </label>
        {showTmdb ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.autoTmdb !== false}
              onChange={(e) => set({ autoTmdb: e.target.checked })}
            />
            Auto-fetch TMDB metadata on import
          </label>
        ) : null}
        {showEpg ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.autoAssignEpg !== false}
              onChange={(e) => set({ autoAssignEpg: e.target.checked })}
            />
            Auto-assign EPG to new live streams
          </label>
        ) : null}
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        Turn off “Add new streams” to refresh names only (PPV titles) without recreating anything you
        deleted.
      </p>
    </div>
  );
}

export function ScopeDualList({
  label,
  items,
  selectedIds,
  onChange,
  hint,
}: {
  label: string;
  items: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <DualListPicker
        items={items}
        selectedIds={selectedIds}
        onChange={onChange}
        availableTitle="Available"
        selectedTitle="Selected (empty = all)"
      />
      {hint ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
