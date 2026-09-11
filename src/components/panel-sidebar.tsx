"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  getAdminSidebarNav,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavLink,
} from "@/lib/admin-sidebar-nav";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { withSidebarItemIcons } from "@/lib/panel-nav-bridge";
import type { ResellerGroupFlags } from "@/lib/reseller-group-flags";
import { searchOperatorFeatures } from "@/lib/operator-feature-index";
import { PanelBrandMark } from "@/components/panel-brand-mark";
import { PanelSidebarVersion } from "@/components/panel-sidebar-version";
import { PanelSidebarReport } from "@/components/panel-sidebar-report";
import { PanelSidebarSuggestions } from "@/components/panel-sidebar-suggestions";
import { PanelLiveChat } from "@/components/panel-live-chat";
import ChatAssistant from "@/components/chat-assistant";

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

function groupMatchScore(pathname: string, group: SidebarNavGroup, search: string = ""): number {
  let best = 0;
  for (const item of group.items) {
    if (!pathActive(pathname, item.href, search)) continue;
    const clean = (item.href.split("?")[0] ?? item.href).replace(/\/$/, "") || "/";
    let score = clean.length * 10;
    if (pathname === clean || pathname.replace(/\/$/, "") === clean) score += 1000;
    best = Math.max(best, score);
  }
  return best;
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

function itemMatches(item: { label: string; section?: string; keywords?: string; href: string }, query: string) {
  if (labelMatches(item.label, query)) return true;
  if (item.section && labelMatches(item.section, query)) return true;
  if (item.keywords && labelMatches(item.keywords, query)) return true;
  if (labelMatches(item.href, query)) return true;
  return false;
}

function filterNavEntries(entries: SidebarNavEntry[], query: string): SidebarNavEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;

  const aliasHrefs = new Set(
    searchOperatorFeatures(q).map((f) => (f.href.split("?")[0] ?? f.href).replace(/\/$/, ""))
  );

  const result: SidebarNavEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      const href = (entry.link.href.split("?")[0] ?? entry.link.href).replace(/\/$/, "");
      if (labelMatches(entry.link.label, q) || aliasHrefs.has(href)) result.push(entry);
      continue;
    }

    const groupLabelMatch = labelMatches(entry.group.label, q);
    const matchedItems = groupLabelMatch
      ? entry.group.items
      : entry.group.items.filter((item) => {
          const href = (item.href.split("?")[0] ?? item.href).replace(/\/$/, "");
          return itemMatches(item, q) || aliasHrefs.has(href);
        });

    if (matchedItems.length === 0) continue;

    result.push({
      kind: "group",
      group: { ...entry.group, items: matchedItems },
    });
  }
  return result;
}

function activeGroupIds(pathname: string, entries: SidebarNavEntry[], search: string = ""): Set<string> {
  const topLevelHrefs = new Set(
    entries
      .filter((e): e is { kind: "link"; link: SidebarNavLink } => e.kind === "link")
      .map((e) => (e.link.href.split("?")[0] ?? e.link.href).replace(/\/$/, "") || "/")
  );
  const pathKey = pathname.replace(/\/$/, "") || "/";
  // Dedicated top-level links (e.g. Live Connections) must not auto-open a group with the same href.
  if (topLevelHrefs.has(pathKey) || topLevelHrefs.has(pathname)) return new Set();

  let bestId: string | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    if (entry.kind !== "group") continue;
    const score = groupMatchScore(pathname, entry.group, search);
    // Prefer later (more specific) groups on a tie — e.g. Servers over Diagnostics shortcuts
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      bestId = entry.group.id;
    }
  }
  // Accordion: open only the best-matching category for this route
  return bestId ? new Set([bestId]) : new Set();
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

function prefetchHref(router: { prefetch: (href: string) => void }, href: string) {
  const path = href.split("?")[0];
  if (!path.startsWith("/")) return;
  void router.prefetch(path);
}

function SidebarGroup({
  group,
  pathname,
  search,
  open,
  collapsed,
  routeActive,
  pendingHref,
  onToggle,
  onNavigate,
  onPrefetch,
  onPending,
}: {
  group: SidebarNavGroup;
  pathname: string;
  search: string;
  open: boolean;
  collapsed: boolean;
  /** True only for the best-matching category for the current route (not shortcut duplicates). */
  routeActive: boolean;
  pendingHref: string | null;
  onToggle: () => void;
  onNavigate: () => void;
  onPrefetch: () => void;
  onPending: (href: string) => void;
}) {
  const active = routeActive;
  const sections = groupItemsBySection(group.items);

  const submenu = (
    <div className="panel-nav-submenu sidebar-submenu-open">
      {sections.map((section) => {
        const sectionActive = section.items.some((item) => pathActive(pathname, item.href, search));
        return (
        <div
          key={section.section ?? "_default"}
          className={`panel-nav-section ${sectionActive ? "panel-nav-section--active" : ""}`}
        >
          {section.section && (
            <div className="panel-nav-section-label">{section.section}</div>
          )}
          <div className="panel-nav-section-items">
            {section.items.map((item) => {
              const itemActive = pathActive(pathname, item.href, search);
              const pending = pendingHref === item.href && !itemActive;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onClick={() => {
                    onPending(item.href);
                    onNavigate();
                  }}
                  title={item.label}
                  aria-current={itemActive ? "page" : undefined}
                  className={`panel-nav-sub-link ${itemActive ? "panel-nav-sub-link--active" : ""} ${
                    pending ? "panel-nav-sub-link--pending" : ""
                  }`}
                >
                  {item.icon && <span className="panel-nav-sub-icon shrink-0">{item.icon}</span>}
                  <span className="panel-nav-sub-text truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );

  return (
    <div
      className={`panel-nav-group ${open ? "panel-nav-group--open" : ""} ${
        active ? "panel-nav-group--current" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        title={group.label}
        aria-expanded={open}
        aria-current={active ? "true" : undefined}
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
  username,
  forceCollapsed,
}: {
  entries: SidebarNavEntry[];
  className?: string;
  onNavigate?: () => void;
  brand?: string;
  brandHref?: string;
  showReport?: boolean;
  username?: string;
  /** Used by the unfolded-foldable/tablet shell rail. */
  forceCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const navRef = useRef<HTMLElement | null>(null);
  const scrollPosRef = useRef(0);
  /** When set, route sync will not re-open this group until the path changes. */
  const suppressRouteOpenRef = useRef<string | null>(null);
  const routeKeyRef = useRef(`${pathname}${search}`);

  const [collapsed, setCollapsed] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [navFilter, setNavFilter] = useState("");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const deferredFilter = useDeferredValue(navFilter);
  const isFiltering = deferredFilter.trim().length > 0;
  const visibleEntries = filterNavEntries(entries, deferredFilter);
  const routeActiveIds = activeGroupIds(pathname, entries, search);
  /** Mobile drawer: never use the desktop collapsed (72px) rail. */
  const isMobileDrawer = Boolean(onNavigate);
  const effectiveCollapsed = isMobileDrawer ? false : (forceCollapsed ?? collapsed);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname, search]);

  useEffect(() => {
    for (const entry of entries) {
      if (entry.kind === "link" && !entry.link.openInNewTab) {
        prefetchHref(router, entry.link.href);
      }
    }
  }, [entries, router]);

  useEffect(() => {
    if (!isMobileDrawer) {
      setCollapsed(readPersistedCollapsed());
    } else {
      setCollapsed(false);
    }
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
  }, [isMobileDrawer]);

  useEffect(() => {
    const routeKey = `${pathname}${search}`;
    if (routeKey !== routeKeyRef.current) {
      routeKeyRef.current = routeKey;
      suppressRouteOpenRef.current = null;
    }
    // Preserve scroll position when route changes expand/collapse groups
    if (navRef.current) scrollPosRef.current = navRef.current.scrollTop;
    setOpenIds((prev) => {
      const active = activeGroupIds(pathname, entries, search);
      if (active.size === 0) {
        if (prev.size <= 1) return prev;
        const first = prev.values().next().value as string | undefined;
        return first ? new Set([first]) : new Set();
      }
      const activeId = active.values().next().value as string;
      if (suppressRouteOpenRef.current === activeId) {
        // User collapsed the category for this page — keep it closed
        return prev.has(activeId) ? new Set() : prev;
      }
      persistOpenIds(active);
      return active;
    });
    requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = scrollPosRef.current;
    });
  }, [pathname, search, entries]);

  useEffect(() => {
    if (!effectiveCollapsed || openIds.size === 0) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".panel-nav-group") || target.closest(".panel-sidebar-flyout")) return;
      setOpenIds(new Set());
      persistOpenIds(new Set());
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [effectiveCollapsed, openIds]);

  function toggle(id: string) {
    if (isFiltering) return;
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (routeActiveIds.has(id)) suppressRouteOpenRef.current = id;
      } else {
        suppressRouteOpenRef.current = null;
        next.clear();
        next.add(id);
        const opened = entries.find((e) => e.kind === "group" && e.group.id === id);
        if (opened && opened.kind === "group") {
          for (const item of opened.group.items) prefetchHref(router, item.href);
        }
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
    <aside className={`panel-sidebar ${effectiveCollapsed ? "panel-sidebar--collapsed" : ""} ${className}`}>
      {brand && (
        <div className="panel-sidebar-brand">
          <PanelBrandMark name={brand} href={brandHref} size="sm" />
        </div>
      )}
      {!effectiveCollapsed && (
        <div className="panel-sidebar-search-wrap">
          <input
            type="search"
            className="panel-sidebar-search"
            placeholder="Find a feature…"
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
            const pending = pendingHref === entry.link.href && !active;
            return (
              <Link
                key={entry.link.href}
                href={entry.link.href}
                prefetch={!entry.link.openInNewTab}
                target={entry.link.openInNewTab ? "_blank" : undefined}
                rel={entry.link.openInNewTab ? "noopener noreferrer" : undefined}
                onClick={() => {
                  if (!entry.link.openInNewTab) setPendingHref(entry.link.href);
                  onChildNavigate();
                }}
                title={entry.link.label}
                className={`panel-nav-link ${active ? "panel-nav-link--active" : ""} ${
                  pending ? "panel-nav-link--pending" : ""
                }`}
              >
                <span className="panel-nav-link-icon shrink-0">{entry.link.icon}</span>
                {!effectiveCollapsed && <span className="panel-nav-link-label truncate">{entry.link.label}</span>}
              </Link>
            );
          }

          return (
            <SidebarGroup
              key={entry.group.id}
              group={entry.group}
              pathname={pathname}
              search={search}
              pendingHref={pendingHref}
              open={displayOpenIds.has(entry.group.id)}
              collapsed={effectiveCollapsed}
              routeActive={routeActiveIds.has(entry.group.id)}
              onToggle={() => toggle(entry.group.id)}
              onNavigate={onChildNavigate}
              onPrefetch={() => {
                for (const item of entry.group.items) prefetchHref(router, item.href);
              }}
              onPending={setPendingHref}
            />
          );
        })}
        {showReport && !effectiveCollapsed && !isFiltering && (
          <div className="panel-sidebar-support mt-2 pt-2">
            <p className="panel-sidebar-support-label">Support</p>
            {username && <PanelLiveChat username={username} variant="sidebar" />}
            <ChatAssistant variant="sidebar" />
            <PanelSidebarSuggestions />
            <PanelSidebarReport />
          </div>
        )}
      </nav>

      {!isMobileDrawer && !forceCollapsed && (
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
      )}

      {!effectiveCollapsed && <PanelSidebarVersion />}
    </aside>
  );
}

export function AdminPanelSidebar({
  brand,
  brandHref = "/admin/dashboard",
  username,
  forceCollapsed,
}: {
  brand?: string;
  brandHref?: string;
  username?: string;
  forceCollapsed?: boolean;
} = {}) {
  return (
    <Suspense fallback={<aside className="panel-sidebar" aria-hidden />}>
      <PanelSidebar
        entries={withSidebarItemIcons(getAdminSidebarNav())}
        brand={brand}
        brandHref={brandHref}
        showReport
        username={username}
        forceCollapsed={forceCollapsed}
      />
    </Suspense>
  );
}

export function ResellerPanelSidebar({
  brand,
  brandHref = "/reseller/dashboard",
  username,
  flags,
  forceCollapsed,
}: {
  brand?: string;
  brandHref?: string;
  username?: string;
  flags?: Partial<ResellerGroupFlags>;
  forceCollapsed?: boolean;
} = {}) {
  return (
    <Suspense fallback={<aside className="panel-sidebar" aria-hidden />}>
      <PanelSidebar
        entries={withSidebarItemIcons(getResellerSidebarNav(flags))}
        brand={brand}
        brandHref={brandHref}
        showReport
        username={username}
        forceCollapsed={forceCollapsed}
      />
    </Suspense>
  );
}
