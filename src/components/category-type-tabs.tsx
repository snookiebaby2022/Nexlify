"use client";

const TABS = [
  { id: "LIVE", label: "Streams" },
  { id: "MOVIE", label: "Movies" },
  { id: "SERIES", label: "Series" },
  { id: "RADIO", label: "Radio" },
] as const;

export type CategoryTab = (typeof TABS)[number]["id"];

export function CategoryTypeTabs({
  active,
  onChange,
  counts,
}: {
  active: CategoryTab;
  onChange: (tab: CategoryTab) => void;
  counts?: Partial<Record<CategoryTab, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b pb-0" style={{ borderColor: "var(--border)" }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className="px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors cursor-pointer"
          style={{
            borderColor: active === t.id ? "#00c0ef" : "transparent",
            color: active === t.id ? "#00c0ef" : "var(--muted)",
            background: active === t.id ? "rgba(0,192,239,0.08)" : "transparent",
          }}
        >
          {t.label}
          {counts?.[t.id] != null ? ` (${counts[t.id]})` : ""}
        </button>
      ))}
    </div>
  );
}

export const CATEGORY_TYPE_LABELS: Record<CategoryTab, string> = {
  LIVE: "Live TV",
  MOVIE: "Movie",
  SERIES: "TV Series",
  RADIO: "Radio Station",
};
