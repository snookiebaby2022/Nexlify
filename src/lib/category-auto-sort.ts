import { normalizeCategoryName } from "./category-options";

export type CategorySortPresetId =
  | "operator-order"
  | "uk-sports-us"
  | "country-groups"
  | "alphabetical"
  | "custom";

export type CategorySortInput = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type CategorySortPreset = {
  id: CategorySortPresetId;
  label: string;
  description: string;
  /** Match tiers in order — first match wins. Empty = alphabetical only. */
  lines: string[];
};

export const CATEGORY_SORT_PRESETS: Record<
  Exclude<CategorySortPresetId, "custom">,
  CategorySortPreset
> = {
  "operator-order": {
    id: "operator-order",
    label: "Operator order (Sky · US · Sports · 24/7 · A–Z)",
    description:
      "UK folders in Sky EPG order, US in network order, sports block, 24/7 block, then everything else A–Z.",
    lines: [
      "UK | Entertainment (HEVC)",
      "UK | Entertainment",
      "UK | Sky Sports / TNT Sports (HEVC)",
      "UK | Sky Sports + EFL",
      "UK | Sky Sports +",
      "UK | Sky Sports",
      "UK | TNT Sports",
      "UK | Sky",
      "UK | Movies (HEVC)",
      "UK | Movies",
      "UK | Documentaries",
      "UK | Documentary",
      "UK | News",
      "UK | Kids",
      "UK | Music",
      "UK | Regionals",
      "UK | Channels +1",
      "UK | Ireland",
      "UK | International",
      "UK | Religious",
      "UK | EPL Events",
      "UK | EPL Teams",
      "UK | EFL Championship",
      "UK | EFL League 1",
      "UK | EFL League 2",
      "UK | EFL Events",
      "UK | SPFL Premiership",
      "UK | National League",
      "UK | Football",
      "UK | Cricket",
      "UK | Rugby",
      "UK | Boxing",
      "UK | UFC",
      "UK | MMA",
      "UK | Tennis",
      "UK | Golf",
      "UK | F1",
      "UK | Motorsport",
      "UK | Sport",
      "UK | Sports",
      "UK |",
      "Ireland",
      "IE |",
      "US | Entertainment (HEVC)",
      "US | Entertainment",
      "US | Networks",
      "US | Locals",
      "US | News",
      "US | Sports",
      "US | Movies",
      "US | Kids",
      "US | Documentaries",
      "US | Documentary",
      "US | Music",
      "US | Latino",
      "US | NFL",
      "US | NBA",
      "US | NHL",
      "US | MLB",
      "US |",
      "CA |",
      "Canada",
      "Sports",
      "Sport",
      "Football",
      "Soccer",
      "Cricket",
      "Rugby",
      "Boxing",
      "UFC",
      "MMA",
      "Tennis",
      "Golf",
      "F1",
      "Motorsport",
      "Racing",
      "NBA",
      "NFL",
      "MLB",
      "NHL",
      "PPV",
      "24/7",
      "24-7",
      "247",
      "24 7",
    ],
  },
  "uk-sports-us": {
    id: "uk-sports-us",
    label: "UK → Sports → US → A–Z",
    description: "UK & Ireland first, then sports folders, then US/Canada, then everything else A–Z.",
    lines: [
      "UK",
      "Ireland",
      "IE",
      "Sports",
      "Sport",
      "Football",
      "Cricket",
      "Rugby",
      "Boxing",
      "UFC",
      "MMA",
      "Tennis",
      "Golf",
      "F1",
      "Motorsport",
      "Racing",
      "NBA",
      "NFL",
      "MLB",
      "US",
      "USA",
      "Canadian",
      "Canada",
      "CA",
      "Australia",
      "AU",
    ],
  },
  "country-groups": {
    id: "country-groups",
    label: "Country groups",
    description: "Group major regions/countries, then A–Z within each group.",
    lines: [
      "UK",
      "Ireland",
      "IE",
      "US",
      "USA",
      "Canadian",
      "Canada",
      "Australia",
      "AU",
      "NZ",
      "French",
      "FR",
      "German",
      "DE",
      "Spanish",
      "ES",
      "Italian",
      "IT",
      "Portuguese",
      "PT",
      "Dutch",
      "NL",
      "Polish",
      "PL",
      "Turkish",
      "TR",
      "Arabic",
      "AR",
      "Indian",
      "IN",
      "Pakistani",
      "PK",
      "Bangla",
      "Filipino",
      "PH",
      "Greek",
      "GR",
      "Romanian",
      "RO",
      "Scandinavian",
      "Balkan",
      "Latino",
      "Brazilian",
      "Mexican",
      "Chinese",
      "CN",
      "Japanese",
      "JP",
      "Korean",
      "KR",
      "Thai",
      "Vietnamese",
      "African",
      "International",
    ],
  },
  alphabetical: {
    id: "alphabetical",
    label: "A–Z",
    description: "Simple alphabetical order within each parent level.",
    lines: [],
  },
};

function normLine(line: string): string {
  return normalizeCategoryName(line);
}

function categoryMatchesLine(name: string, line: string): boolean {
  const n = normalizeCategoryName(name);
  const raw = line.trim();
  const l = normLine(line);
  if (!l) return false;
  if (n === l) return true;
  // "UK |" catch-all and short region codes — prefix only.
  const regionPrefix = /\|$/.test(raw) || l.length <= 3;
  if (regionPrefix) {
    return n === l || n.startsWith(`${l} `) || n.startsWith(l);
  }
  // Full folder names stay exact so HEVC / +1 get their own tier.
  if (raw.includes("|")) return false;
  if (l.length < 4) return false;
  return n.includes(l);
}

/** Lower tier = appears higher in apps. Unmatched categories share the last tier. */
export function categorySortTier(name: string, lines: string[]): number {
  const n = normalizeCategoryName(name);
  if (!lines.length) return 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    if (categoryMatchesLine(name, line)) return i;
  }
  return lines.length;
}

export function compareCategoriesForAutoSort(
  a: Pick<CategorySortInput, "name" | "sortOrder">,
  b: Pick<CategorySortInput, "name" | "sortOrder">,
  lines: string[]
): number {
  const ta = categorySortTier(a.name, lines);
  const tb = categorySortTier(b.name, lines);
  if (ta !== tb) return ta - tb;
  const byName = normalizeCategoryName(a.name).localeCompare(normalizeCategoryName(b.name));
  if (byName !== 0) return byName;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** Assign sequential sortOrder within each sibling group (same parentId). */
export function buildAutoSortUpdates(
  categories: CategorySortInput[],
  lines: string[]
): { id: string; sortOrder: number }[] {
  const byParent = new Map<string | null, CategorySortInput[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }

  const updates: { id: string; sortOrder: number }[] = [];
  for (const siblings of byParent.values()) {
    const sorted = [...siblings].sort((a, b) => compareCategoriesForAutoSort(a, b, lines));
    sorted.forEach((c, index) => {
      if (c.sortOrder !== index) updates.push({ id: c.id, sortOrder: index });
    });
  }
  return updates;
}

export function resolveSortLines(
  preset: CategorySortPresetId,
  customLines?: string[] | null
): string[] {
  if (preset === "custom") {
    return (customLines ?? [])
      .map((l) => String(l).trim())
      .filter(Boolean);
  }
  return [...CATEGORY_SORT_PRESETS[preset].lines];
}

export function previewAutoSort(
  categories: CategorySortInput[],
  lines: string[]
): { id: string; name: string; tier: number; sortOrder: number }[] {
  const byParent = new Map<string | null, CategorySortInput[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  const preview: { id: string; name: string; tier: number; sortOrder: number }[] = [];
  for (const siblings of byParent.values()) {
    const sorted = [...siblings].sort((a, b) => compareCategoriesForAutoSort(a, b, lines));
    sorted.forEach((c, index) => {
      preview.push({
        id: c.id,
        name: c.name,
        tier: categorySortTier(c.name, lines),
        sortOrder: index,
      });
    });
  }
  preview.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || normalizeCategoryName(a.name).localeCompare(normalizeCategoryName(b.name))
  );
  return preview;
}
