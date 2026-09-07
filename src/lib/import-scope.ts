/** Shared import / name-refresh scope: playlist groups, panel IDs, CSV lists. */

export function parseIdList(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map((id) => String(id))
    : String(raw ?? "").split(/[\n,]+/);
  return [...new Set(parts.map((id) => id.trim()).filter(Boolean))];
}

export function parseGroupFilter(raw: unknown): string[] {
  return parseIdList(raw);
}

export function normalizeGroupKey(name: string): string {
  return name.trim().toLowerCase();
}

export function entryMatchesGroupFilter(
  group: string | null | undefined,
  filter: string[]
): boolean {
  if (!filter.length) return true;
  const key = normalizeGroupKey(group || "");
  if (!key) return false;
  const allowed = new Set(filter.map(normalizeGroupKey));
  return allowed.has(key);
}

export function toCsv(ids: string[]): string {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].join(",");
}
