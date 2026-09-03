/** Sort live/movie/series names for Channel order auto-sort. */

export type StreamAutoOrderPresetId = "sky-uk" | "usa-az" | "uk-az" | "az" | "numeric";

export type StreamAutoOrderPreset = {
  id: StreamAutoOrderPresetId;
  label: string;
  description: string;
};

export const STREAM_AUTO_ORDER_PRESETS: StreamAutoOrderPreset[] = [
  {
    id: "sky-uk",
    label: "Sky UK / LCN",
    description: "Order by channel number in the name (101 BBC One, Sky 401…), then A–Z.",
  },
  {
    id: "usa-az",
    label: "USA A–Z",
    description: "Alphabetical, ignoring US/USA prefixes so ABC/CBS/NBC group together.",
  },
  {
    id: "uk-az",
    label: "UK A–Z",
    description: "Alphabetical, ignoring UK/GB prefixes.",
  },
  {
    id: "az",
    label: "A–Z",
    description: "Simple alphabetical order.",
  },
  {
    id: "numeric",
    label: "Number in name",
    description: "Leading digits first (1, 2, 10…), then A–Z.",
  },
];

const LCN_RE = /(?:^|[|\s#])(?:s(?:ky)?\s*)?(\d{1,4})(?:\s|$|[.:,-])/i;
const LEADING_NUM_RE = /^\s*(\d{1,5})\b/;

export function extractChannelNumber(name: string): number | null {
  const raw = String(name ?? "");
  const lead = raw.match(LEADING_NUM_RE);
  if (lead) return Number(lead[1]);
  const mid = raw.match(LCN_RE);
  if (mid) return Number(mid[1]);
  return null;
}

function stripRegionPrefix(name: string, prefixes: string[]): string {
  const raw = String(name ?? "").trim();
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}\\b\\s*(?:[|:/-]\\s*)?`, "i");
    if (re.test(raw)) return raw.replace(re, "").trim().toLowerCase();
  }
  return raw.toLowerCase();
}

function stripUsaPrefix(name: string): string {
  return stripRegionPrefix(name, ["united states", "usa", "us"]);
}

function stripUkPrefix(name: string): string {
  return stripRegionPrefix(name, ["united kingdom", "sky uk", "uk", "gb"]);
}

export function compareStreamsForAutoOrder(
  a: { name: string },
  b: { name: string },
  preset: StreamAutoOrderPresetId
): number {
  if (preset === "usa-az") {
    return stripUsaPrefix(a.name).localeCompare(stripUsaPrefix(b.name), undefined, { numeric: true, sensitivity: "base" });
  }
  if (preset === "uk-az") {
    return stripUkPrefix(a.name).localeCompare(stripUkPrefix(b.name), undefined, { numeric: true, sensitivity: "base" });
  }
  if (preset === "az") {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }
  const na = extractChannelNumber(a.name);
  const nb = extractChannelNumber(b.name);
  const aHas = na != null;
  const bHas = nb != null;
  if (aHas && bHas && na !== nb) return (na as number) - (nb as number);
  if (aHas !== bHas) return aHas ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function applyStreamAutoOrder<T extends { name: string }>(
  rows: T[],
  preset: StreamAutoOrderPresetId
): T[] {
  return [...rows].sort((a, b) => compareStreamsForAutoOrder(a, b, preset));
}
