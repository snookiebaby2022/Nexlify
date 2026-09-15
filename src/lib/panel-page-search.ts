import type { SidebarNavEntry } from "@/lib/admin-sidebar-nav";
import { searchOperatorFeatures } from "@/lib/operator-feature-index";

export type PanelSearchHit = {
  label: string;
  href: string;
  group: string;
};

function flattenNav(entries: SidebarNavEntry[]): PanelSearchHit[] {
  const hits: PanelSearchHit[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      hits.push({ label: entry.link.label, href: entry.link.href, group: entry.link.label });
      continue;
    }
    for (const item of entry.group.items) {
      hits.push({
        label: item.label,
        href: item.href,
        group: entry.group.label,
      });
    }
  }
  return hits;
}

function scoreHit(hit: PanelSearchHit, q: string): number {
  const label = hit.label.toLowerCase();
  const group = hit.group.toLowerCase();
  const href = hit.href.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (group.includes(q)) return 40;
  if (href.includes(q.replace(/\s+/g, "-"))) return 30;
  return 10;
}

export function searchPanelPages(
  query: string,
  role: "ADMIN" | "RESELLER",
  entries: SidebarNavEntry[]
): PanelSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const hits: PanelSearchHit[] = [];

  const push = (hit: PanelSearchHit) => {
    const key = hit.href.replace(/\/$/, "") || "/";
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const row of flattenNav(entries)) {
    const hay = `${row.label} ${row.group} ${row.href}`.toLowerCase();
    if (hay.includes(q)) push(row);
  }

  if (role === "ADMIN") {
    for (const f of searchOperatorFeatures(q)) {
      push({ label: f.label, href: f.href, group: f.group });
    }
  } else {
    for (const f of searchOperatorFeatures(q)) {
      const resellerHref = f.href.replace(/^\/admin\//, "/reseller/");
      if (resellerHref !== f.href && flattenNav(entries).some((e) => e.href.startsWith(resellerHref.split("?")[0] ?? ""))) {
        push({ label: f.label, href: resellerHref, group: f.group });
      }
    }
  }

  return hits.sort((a, b) => scoreHit(b, q) - scoreHit(a, q)).slice(0, 12);
}
