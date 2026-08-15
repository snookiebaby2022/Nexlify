"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  getAdminSidebarNav,
  type SidebarNavEntry,
  type SidebarNavGroup,
} from "@/lib/admin-sidebar-nav";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { withSidebarItemIcons } from "@/lib/panel-nav-bridge";
import { PanelBrandMark } from "@/components/panel-brand-mark";
import { PanelSidebarVersion } from "@/components/panel-sidebar-version";
import { PanelSidebarReport } from "@/components/panel-sidebar-report";
import { PanelSidebarSuggestions } from "@/components/panel-sidebar-suggestions";

function pathActive(pathname: string, href: string, search: string = "") {
  const [cleanHref, hrefQuery = ""] = href.split("?");

  // Query-aware match for links like /admin/categories?type=MOVIE
  if (hrefQuery) {
    if (pathname !== cleanHref) return false;
    const want = new URLSearchParams(hrefQuery);
    const have = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const [k, v] of want.entries()) {
      if ((have.get(k) ?? "").toUpperCase() !== v.toUpperCase()) return false;
    }
    return true;
  }

  if (pathname === cleanHref) {
    // Prefer exact query links when on categories type pages — bare path matches LIVE default only
    if (pathname === "/admin/categories" || pathname === "/admin/management/categories") {
      const have = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const t = (have.get("type") ?? "LIVE").toUpperCase();
      return t === "LIVE";
    }
    return true;
  }

  if (!pathname.startsWith(`${cleanHref}/`)) return false;

  // For child paths, only match if the remaining segment looks like an ID
  // (not an action word like "add", "edit", "mass-edit", etc.)
  const rest = pathname.slice(cleanHref.length + 1);
  const firstSegment = rest.split("/")[0];

  // Known action/sibling pages that should NOT match their parent
  const actionPages = new Set([
    "add", "new", "mass-edit", "bulk", "edit", "settings", "profile",
    "resource-charts", "load-balancer", "calendar", "wizard", "install",
    "proxies", "analytics", "pdf", "bandwidth", "viewer-heatmap", "sub",
    "convert-to-line", "events", "order", "access", "countries", "channels",
    "sources", "add-package", "mass", "stream-health", "monitoring",
    "theft-detection", "blocked-ips", "blocked-isps", "blocked-asns",
    "blocked-user-agents", "fingerprint", "cdn-ips", "security",
    "general", "community", "streams", "server", "domains", "binaries",
    "player", "cache", "backup", "geo", "tmdb", "notifications", "cron",
    "billing", "catchup", "white-label", "server-guard", "performance-core",
    "auto-fix", "lb-redirect", "cloud-backup", "server-cleaner", "vod-proxy",
    "apps-lock", "stream-analyzer", "source-swap", "source-monitor",
    "prefix-manager", "batch-manager", "expiry-videos", "disk-monitor",
    "updates", "show", "renew", "addon", "overview", "spotify", "apple-music",
    "deezer", "youtube-music", "plex", "emby", "jellyfin", "youtube",
    "connections", "line-activity", "credits", "usage", "commission",
    "epg-view", "dashboard", "import", "queue", "watch-folders",
    "process-monitor", "license", "live-connections", "sub-resellers",
    "bouquet-access", "add-bouquet", "manage-bouquets", "order-bouquets",
    "import-movies", "import-series", "add-group", "user-groups",
    "create-channel", "channel-order", "stream-tools", "provider-urls",
    "mass-delete", "panel-migration", "epg-sources", "epg-channel-map",
    "all-countries", "epg-guide-browser", "epg-calendar", "add-epg-source",
    "add-movie", "manage-movies", "add-series", "manage-series", "add-episode",
    "manage-episodes", "vod-browser", "vod-providers", "add-stream",
    "manage-streams", "radio-stations", "add-server", "manage-servers",
    "server-install", "server-wizard", "balancer", "add-proxy",
    "manage-proxies", "rtmp-ips", "add-user", "manage-users", "add-package",
    "manage-packages", "tools-home", "content", "series", "movies", "episodes",
    "streams", "add-reseller", "manage-resellers", "resellers", "sub",
    "add-line", "manage-lines", "add-line-with-package", "mass-edit-lines",
    "add-mag-device", "add-mag-device-with-package", "bulk-add-mag-devices",
    "manage-mag-devices", "convert-mag-to-line", "add-enigma2-device",
    "add-enigma2-device-with-package", "manage-enigma2-devices",
    "manage-device-events", "add-line-package", "mass-edit", "import",
    "add-reseller", "sub-resellers",
    // Content folder names
    "created", "video", "archive", "delayed", "playlists", "vod", "epg",
  ]);

  if (actionPages.has(firstSegment)) return false;

  // If the remaining segment is all lowercase letters/hyphens and short,
  // it's likely an action page, not a detail page
  const isActionWord = /^[a-z-]+$/.test(firstSegment) && firstSegment.length < 25;

  // Exceptions: IDs (cuid, uuid, numeric)
  const isId =
    /^[a-z0-9]{20,}$/i.test(firstSegment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstSegment) ||
    /^\d+$/.test(firstSegment);

  if (isActionWord && !isId) return false;

  return true;
}

function groupActive(pathname: string, group: SidebarNavGroup, search: string = "") {
  return group.items.some((i) => pathActive(pathname, i.href, search));
}

function groupItemsBySection(items: SidebarNavGroup["items"]) {
  const groups: { section: string | null; items: typeof items }[] = [];
  for (const item of items) {
    const key = item.section ?? "";
    let g = groups.find((x) => (x.section ?? "") === key);
    if (!g) {
      g = { section: item.section ?? null, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

function labelMatches(label: string, query: string) {
  return label.toLowerCase().includes(query);
}

function filterNavEntries(entries: SidebarNavEntry[], query: string): SidebarNavEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;

  const result: SidebarNavEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      if (labelMatches(entry.link.label, q)) result.push(entry);
      continue;
    }

    const groupLabelMatch = labelMatches(entry.group.label, q);
    const matchedItems = groupLabelMatch
      ? entry.group.items
      : entry.group.items.filter((item) => labelMatches(item.label, q));

    if (matchedItems.length === 0) continue;

    result.push({
      kind: "group",
      group: { ...entry.group, items: matchedItems },
    });
  }
  return result;
}

function activeGroupIds(pathname: string, entries: SidebarNavEntry[], search: string = ""): Set<string> {
  const next = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "group" && groupActive(pathname, entry.group, search)) {
      next.add(entry.group.id);
    }
  }
  // Accordion: at most one open group from route
  if (next.size > 1) {
    const first = next.values().next().value as string;
    return new Set([first]);
  }
  return next;
}

const SIDEBAR_OPEN_KEY = "nexlify-sidebar-open";
const SIDEBAR_COLLAPSED_KEY = "nexlify-sidebar-collapsed";

function readPersistedOpenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SIDEBAR_OPEN_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function persistOpenIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function readPersistedCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function SidebarGroup({
  group,
  pathname,
  search,
  open,
  collapsed,
  onToggle,
  onNavigate,
}: {
  group: SidebarNavGroup;
  pathname: string;
  search: string;
  open: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const active = groupActive(pathname, group, search);
  const sections = groupItemsBySection(group.items);

  const submenu = (
    <div className="panel-nav-submenu sidebar-submenu-open">
      {sections.map((section) => (
        <div key={section.section ?? "_default"} className="panel-nav-section">
          {section.section && (
            <div className="panel-nav-section-label">{section.section}</div>
          )}
          <div className="panel-nav-section-items">
            {section.items.map((item) => {
              const itemActive = pathActive(pathname, item.href, search);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={item.label}
                  className={`panel-nav-sub-link ${itemActive ? "panel-nav-sub-link--active" : ""}`}
                >
                  {item.icon && <span className="panel-nav-sub-icon shrink-0">{item.icon}</span>}
                  <span className="panel-nav-sub-text truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`panel-nav-group ${open ? "panel-nav-group--open" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        title={group.label}
        aria-expanded={open}
        className={`panel-nav-group-btn ${active ? "panel-nav-group-btn--active" : ""} ${
          open && !active ? "panel-nav-group-btn--open" : ""
        }`}
      >
        <span className="panel-nav-group-icon shrink-0">{group.icon}</span>
        {!collapsed && <span className="panel-nav-group-label flex-1 text-left truncate">{group.label}</span>}
        {!collapsed && (
          <ChevronDown
            size={16}
            className={`panel-nav-chevron shrink-0 ${open ? "panel-nav-chevron--open" : ""}`}
          />
        )}
      </button>

      {open && !collapsed && submenu}

      {open && collapsed && (
        <div className="panel-sidebar-flyout" role="menu">
          <p className="panel-sidebar-flyout-title">{group.label}</p>
          {submenu}
        </div>
      )}
    </div>
  );
}

export function PanelSidebar({
  entries,
  className = "",
  onNavigate,
  brand,
  brandHref = "/admin/dashboard",
  showReport = false,
}: {
  entries: SidebarNavEntry[];
  className?: string;
  onNavigate?: () => void;
  brand?: string;
  brandHref?: string;
  showReport?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const navRef = useRef<HTMLElement | null>(null);
  const scrollPosRef = useRef(0);

  const [collapsed, setCollapsed] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [navFilter, setNavFilter] = useState("");
  const deferredFilter = useDeferredValue(navFilter);
  const isFiltering = deferredFilter.trim().length > 0;
  const visibleEntries = filterNavEntries(entries, deferredFilter);

  useEffect(() => {
    setCollapsed(readPersistedCollapsed());
    const active = activeGroupIds(pathname, entries, search);
    if (active.size > 0) {
      setOpenIds(active);
      persistOpenIds(active);
      return;
    }
    const persisted = readPersistedOpenIds();
    // Accordion: restore at most one persisted group
    const one = persisted.values().next().value;
    setOpenIds(one ? new Set([one as string]) : new Set());
  }, []);

  useEffect(() => {
    // Preserve scroll position when route changes expand/collapse groups
    if (navRef.current) scrollPosRef.current = navRef.current.scrollTop;
    setOpenIds((prev) => {
      const active = activeGroupIds(pathname, entries, search);
      if (active.size === 0) {
        if (prev.size <= 1) return prev;
        const first = prev.values().next().value as string | undefined;
        return first ? new Set([first]) : new Set();
      }
      persistOpenIds(active);
      return active;
    });
    requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = scrollPosRef.current;
    });
  }, [pathname, search, entries]);

  useEffect(() => {
    if (!collapsed || openIds.size === 0) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".panel-nav-group") || target.closest(".panel-sidebar-flyout")) return;
      setOpenIds(new Set());
      persistOpenIds(new Set());
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [collapsed, openIds]);

  function toggle(id: string) {
    if (isFiltering) return;
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Collapse other groups when opening a new one
        next.clear();
        next.add(id);
      }
      persistOpenIds(next);
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      persistCollapsed(next);
      return next;
    });
  }

  function onChildNavigate() {
    onNavigate?.();
  }

  const displayOpenIds = isFiltering
    ? new Set(
        visibleEntries
          .filter((e): e is { kind: "group"; group: SidebarNavGroup } => e.kind === "group")
          .map((e) => e.group.id)
      )
    : openIds;

  return (
    <aside className={`panel-sidebar ${collapsed ? "panel-sidebar--collapsed" : ""} ${className}`}>
      {brand && (
        <div className="panel-sidebar-brand">
          <PanelBrandMark name={brand} href={brandHref} size="sm" />
        </div>
      )}
      {!collapsed && (
        <div className="panel-sidebar-search-wrap">
          <input
            type="search"
            className="panel-sidebar-search"
            placeholder="Search…"
            value={navFilter}
            onChange={(e) => setNavFilter(e.target.value)}
            aria-label="Search navigation"
          />
        </div>
      )}
      <nav ref={navRef} className="panel-sidebar-nav flex-1">
        {visibleEntries.map((entry) => {
          if (entry.kind === "link") {
            const active = pathActive(pathname, entry.link.href, search);
            return (
              <Link
                key={entry.link.href}
                href={entry.link.href}
                target={entry.link.openInNewTab ? "_blank" : undefined}
                rel={entry.link.openInNewTab ? "noopener noreferrer" : undefined}
                onClick={onChildNavigate}
                title={entry.link.label}
                className={`panel-nav-link ${active ? "panel-nav-link--active" : ""}`}
              >
                <span className="panel-nav-link-icon shrink-0">{entry.link.icon}</span>
                {!collapsed && <span className="panel-nav-link-label truncate">{entry.link.label}</span>}
              </Link>
            );
          }

          return (
            <SidebarGroup
              key={entry.group.id}
              group={entry.group}
              pathname={pathname}
              search={search}
              open={displayOpenIds.has(entry.group.id)}
              collapsed={collapsed}
              onToggle={() => toggle(entry.group.id)}
              onNavigate={onChildNavigate}
            />
          );
        })}
      </nav>

      {showReport && !collapsed && (
        <div className="panel-sidebar-footer-actions space-y-1">
          <PanelSidebarSuggestions />
          <PanelSidebarReport />
        </div>
      )}

      <div className="panel-sidebar-collapse-row">
        <button
          type="button"
          className="panel-sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Minimize sidebar</span>}
        </button>
      </div>

      {!collapsed && <PanelSidebarVersion />}
    </aside>
  );
}

export function AdminPanelSidebar({
  brand,
  brandHref = "/admin/dashboard",
}: {
  brand?: string;
  brandHref?: string;
} = {}) {
  return (
    <Suspense fallback={<aside className="panel-sidebar" aria-hidden />}>
      <PanelSidebar
        entries={withSidebarItemIcons(getAdminSidebarNav())}
        brand={brand}
        brandHref={brandHref}
        showReport
      />
    </Suspense>
  );
}

export function ResellerPanelSidebar({
  brand,
  brandHref = "/reseller/dashboard",
}: {
  brand?: string;
  brandHref?: string;
} = {}) {
  return (
    <Suspense fallback={<aside className="panel-sidebar" aria-hidden />}>
      <PanelSidebar
        entries={withSidebarItemIcons(getResellerSidebarNav())}
        brand={brand}
        brandHref={brandHref}
        showReport
      />
    </Suspense>
  );
}
