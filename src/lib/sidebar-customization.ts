import type { SidebarNavEntry } from "@/lib/admin-sidebar-nav";
import { sidebarEntryKey } from "@/lib/admin-ui-preferences";

export function parseSidebarHiddenHrefs(raw: string | undefined | null): Set<string> {
  const set = new Set<string>();
  for (const line of String(raw ?? "").split(/[\n,]+/)) {
    const href = line.trim().split("?")[0];
    if (href.startsWith("/")) set.add(href);
  }
  return set;
}

export function filterSidebarEntries(
  entries: SidebarNavEntry[],
  hidden: Set<string>
): SidebarNavEntry[] {
  if (!hidden.size) return entries;
  const out: SidebarNavEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      const path = entry.link.href.split("?")[0];
      if (hidden.has(path)) continue;
      out.push(entry);
      continue;
    }
    const items = entry.group.items.filter((item) => !hidden.has(item.href.split("?")[0]));
    if (!items.length) continue;
    out.push({ kind: "group", group: { ...entry.group, items } });
  }
  return out;
}

/** Reorder top-level sidebar entries; unknown keys stay in default order at the end. */
export function orderSidebarEntries(entries: SidebarNavEntry[], orderKeys: string[] | undefined): SidebarNavEntry[] {
  if (!orderKeys?.length) return entries;
  const rank = new Map<string, number>();
  orderKeys.forEach((k, i) => rank.set(k, i));
  const keyed = entries.map((e, i) => ({ e, k: sidebarEntryKey(e), i }));
  keyed.sort((a, b) => {
    const ra = rank.has(a.k) ? rank.get(a.k)! : 10_000 + a.i;
    const rb = rank.has(b.k) ? rank.get(b.k)! : 10_000 + b.i;
    return ra - rb || a.i - b.i;
  });
  return keyed.map((x) => x.e);
}
