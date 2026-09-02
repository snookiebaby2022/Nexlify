"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardLiveMetrics } from "@/components/dashboard-live-metrics";
import {
  Activity,
  ChevronDown,
  LogOut,
  Play,
  Menu,
  Search,
  Settings,
  User,
  Sparkles,
  CreditCard,
  Users,
  Zap,
} from "lucide-react";
import { getAdminSidebarNav } from "@/lib/admin-sidebar-nav";
import { sidebarNavToTopNav } from "@/lib/panel-nav-bridge";
import { getResellerPanelNav } from "@/lib/reseller-panel-nav";
import { UserAvatar } from "@/components/user-avatar";
import type { AvatarConfig } from "@/lib/avatar-config";
import { parseAvatarConfig } from "@/lib/avatar-config";
import { randomAvatarConfig } from "@/lib/avatar-catalog";
import { coloredIcon } from "@/lib/nav-item-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoAccentToggle } from "@/components/logo-accent-toggle";
import { PanelBrandMark } from "@/components/panel-brand-mark";
import { PanelNotificationBell } from "@/components/panel-notification-bell";
import { PanelLanguageSwitcher } from "@/components/panel-language-switcher";
import { getMobilePageTitle } from "@/lib/panel-mobile-nav";

export type TopNavItem = { href: string; label: string; section?: string; icon?: React.ReactNode };
export type TopNavMenu = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: TopNavItem[];
};

type HeaderStats = {
  activeLines?: number;
  streams?: number;
  onlineConnections?: number;
  networkInPerMin?: number;
  networkOutPerMin?: number;
  networkInMbps?: number;
  networkOutMbps?: number;
};

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupItems(items: TopNavItem[]) {
  const groups: { section: string | null; items: TopNavItem[] }[] = [];
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

export function PanelTopNav({
  brand,
  brandHref,
  brandLogoUrl,
  role,
  links,
  menus,
  showMenuBar = true,
  username,
  onMenuToggle,
  menuOpen = false,
}: {
  brand: string;
  brandHref?: string;
  brandLogoUrl?: string;
  role: "ADMIN" | "RESELLER";
  links: { href: string; label: string; icon: React.ReactNode }[];
  menus: TopNavMenu[];
  /** Horizontal menu row under header (admin + reseller). */
  showMenuBar?: boolean;
  username?: string;
  /** Opens left navigation on small screens when menu bar is hidden. */
  onMenuToggle?: () => void;
  /** Whether the mobile nav drawer is open (for aria-expanded). */
  menuOpen?: boolean;
}) {
  const homeHref = brandHref ?? (role === "ADMIN" ? "/admin/dashboard" : "/reseller/dashboard");
  const pathname = usePathname();
  const mobilePageTitle = getMobilePageTitle(pathname);
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [stats, setStats] = useState<HeaderStats | null>(null);
  const [resellerCredits, setResellerCredits] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const { data: liveMetrics, connected: liveMetricsConnected } = useDashboardLiveMetrics();

  const loadProfileAvatar = useCallback(() => {
    if (!username) return;
    fetch("/api/admin/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setAvatarUrl(d?.user?.avatarUrl ?? null);
        setAvatarConfig(parseAvatarConfig(d?.user?.avatarConfig));
      })
      .catch(() => {});
  }, [username]);

  useEffect(() => {
    loadProfileAvatar();
    const onUpdate = () => loadProfileAvatar();
    window.addEventListener("nexlify-profile-updated", onUpdate);
    return () => window.removeEventListener("nexlify-profile-updated", onUpdate);
  }, [loadProfileAvatar]);

  useEffect(() => {
    if (role === "ADMIN") {
      const load = () =>
        fetch("/api/admin/stats?light=1")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return;
            setStats({
              activeLines: d.activeLines,
              streams: d.liveStreams ?? d.streams,
              onlineConnections: d.onlineConnections,
              networkInPerMin: d.networkInPerMin,
              networkOutPerMin: d.networkOutPerMin,
              networkInMbps: d.networkInMbps,
              networkOutMbps: d.networkOutMbps,
            });
          })
          .catch(() => {});
      load();
      const t = setInterval(load, 30000);
      return () => clearInterval(t);
    }
    if (role === "RESELLER") {
      const load = () =>
        fetch("/api/reseller/stats")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return;
            setResellerCredits(d.credits ?? 0);
            setStats({
              activeLines: d.activeLines ?? 0,
              streams: d.dashboard?.onlineStreams ?? 0,
              onlineConnections: d.dashboard?.onlineConnections ?? 0,
              networkInPerMin: 0,
              networkOutPerMin: 0,
            });
          })
          .catch(() => {});
      load();
      const onCredits = (e: Event) => {
        const detail = (e as CustomEvent<{ credits?: number }>).detail;
        if (typeof detail?.credits === "number") setResellerCredits(detail.credits);
        else load();
      };
      window.addEventListener("nexlify-credits-updated", onCredits);
      const t = setInterval(load, 60000);
      return () => {
        clearInterval(t);
        window.removeEventListener("nexlify-credits-updated", onCredits);
      };
    }
  }, [role]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setProfileOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  async function randomizeAvatar() {
    if (!username || avatarBusy) return;
    setAvatarBusy(true);
    const config = randomAvatarConfig();
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarConfig: config, avatarUrl: null }),
    });
    setAvatarBusy(false);
    if (res.ok) {
      setAvatarUrl(null);
      setAvatarConfig(config);
      window.dispatchEvent(new Event("nexlify-profile-updated"));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function menuActive(menu: TopNavMenu) {
    return menu.items.some((i) => pathActive(pathname, i.href));
  }

  const connections = liveMetricsConnected
    ? (liveMetrics?.onlineConnections ?? stats?.onlineConnections ?? 0)
    : (stats?.onlineConnections ?? 0);
  const streamCount = stats?.streams ?? 0;
  const inMbps = (
    liveMetricsConnected
      ? (liveMetrics?.networkInMbps ?? 0)
      : (stats?.networkInMbps ?? stats?.networkInPerMin ?? 0)
  ).toFixed(1);
  const outMbps = (
    liveMetricsConnected
      ? (liveMetrics?.networkOutMbps ?? 0)
      : (stats?.networkOutMbps ?? stats?.networkOutPerMin ?? 0)
  ).toFixed(1);

  return (
    <header className="shrink-0 overflow-visible" ref={navRef}>
      <div className="panel-top-header sticky top-0 z-[200]">
        {onMenuToggle && (
          <button
            type="button"
            className="panel-mobile-menu-btn panel-header-icon-btn md:hidden"
            onClick={onMenuToggle}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <Menu size={20} />
          </button>
        )}
        <div className="md:hidden flex-1 min-w-0 px-1">
          <h1 className="panel-mobile-page-title truncate">{mobilePageTitle}</h1>
        </div>

        {role === "RESELLER" && resellerCredits != null && (
          <div className="panel-credits-badge hidden sm:flex" title="Your reseller credit balance">
            {coloredIcon(CreditCard, "#fbbf24", 18)}
            <span className="font-bold tabular-nums text-white text-base leading-none">
              {resellerCredits}
            </span>
            <span className="text-xs text-amber-200/90">credits</span>
          </div>
        )}

        {role === "ADMIN" && (
          <div className="hidden md:flex items-center gap-2 flex-1 flex-wrap">
            <StatPill icon={coloredIcon(Zap, "#fbbf24", 14)} value="0" title="Alerts" />
            <StatPill icon={coloredIcon(Users, "#22d3ee", 14)} value={String(connections)} title="Live connections" />
            <StatPill icon={coloredIcon(Play, "#4ade80", 14)} value={`${streamCount} ↑ 0 ↓`} title="Streams" />
            <StatPill
              icon={coloredIcon(Activity, "#fb923c", 14)}
              value={`${outMbps} Mbps ↑ ${inMbps} Mbps ↓`}
              title={`Bandwidth — output ${outMbps} Mbps, input ${inMbps} Mbps (same as dashboard)`}
            />
          </div>
        )}

        <div className="panel-header-end flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
        <div className="panel-header-controls flex items-center gap-2 sm:gap-3">
          <div className="flex sm:hidden items-center gap-1.5 shrink-0" title="Theme">
            <ThemeToggle />
          </div>
          <div
            className="panel-header-toggle-bar hidden sm:flex items-center gap-2.5 rounded-lg px-3 py-1.5 shrink-0"
            title="Logo accent and theme"
          >
            <span className="hidden md:inline text-xs font-semibold uppercase tracking-wider text-slate-300">
              Logo
            </span>
            <LogoAccentToggle />
            <span className="hidden sm:block w-px h-5 bg-white/10" aria-hidden />
            <ThemeToggle />
            <div className="hidden md:block">
              <PanelLanguageSwitcher />
            </div>
          </div>
          <button
            type="button"
            className="hidden sm:inline-flex p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
            onClick={() => setMobileSearchOpen((o) => !o)}
            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
            aria-expanded={mobileSearchOpen}
          >
            {coloredIcon(Search, "#22d3ee", 18)}
          </button>
          <div className="panel-header-search hidden sm:flex">
            {coloredIcon(Search, "#22d3ee", 18)}
            <input
              type="search"
              placeholder="Search panel…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <PanelNotificationBell role={role} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="block rounded-full cursor-pointer border-2 shrink-0 overflow-hidden ring-2 ring-transparent hover:ring-white/40 transition-shadow"
              style={{ borderColor: "rgba(255,255,255,0.45)" }}
              title="Account menu"
              aria-expanded={profileOpen}
            >
              <UserAvatar
                username={username ?? "admin"}
                photoUrl={avatarUrl}
                avatarConfig={avatarUrl ? null : avatarConfig}
                size={36}
              />
            </button>
            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-1 py-1 rounded shadow-lg min-w-[180px] text-sm z-50"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <div className="px-3 py-2 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  {username ?? "User"}
                </div>
                <Link
                  href={role === "ADMIN" ? "/admin/profile" : "/reseller/profile"}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-black/5"
                  onClick={() => setProfileOpen(false)}
                >
                  {coloredIcon(User, "#60a5fa", 14)}
                  Profile & avatar
                </Link>
                {role === "ADMIN" ? (
                  <Link
                    href="/admin/settings/general"
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-black/5"
                    onClick={() => setProfileOpen(false)}
                  >
                    {coloredIcon(Settings, "#94a3b8", 14)}
                    Settings
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={randomizeAvatar}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-black/5 cursor-pointer disabled:opacity-50"
                >
                  {coloredIcon(Sparkles, "#e879f9", 14)}
                  Randomize avatar
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-black/5 cursor-pointer border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  {coloredIcon(LogOut, "#f87171", 14)}
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="panel-header-mobile-search sm:hidden">
          <div className="panel-header-search w-full">
            {coloredIcon(Search, "#22d3ee", 18)}
            <input
              type="search"
              placeholder="Search panel…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      {showMenuBar && (links.length > 0 || menus.length > 0) && (
      <nav
        className="panel-main-nav relative flex flex-nowrap items-stretch w-full h-11 text-xs overflow-visible"
        style={{
          background: "linear-gradient(180deg, #3d4449 0%, #2f3439 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {links.map((link) => {
          const active = pathActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-1 min-w-0 items-center justify-center gap-1 px-1 h-full transition-colors"
              style={{
                color: active ? "#fff" : "#c5cdd6",
                background: active ? "rgba(0,0,0,0.25)" : "transparent",
                borderBottom: active ? "2px solid #5eb8e8" : "2px solid transparent",
              }}
            >
              <span className="shrink-0">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}

        {menus.map((menu, menuIndex) => {
          const active = menuActive(menu);
          const isOpen = openMenu === menu.id;
          const groups = groupItems(menu.items);
          const alignRight = menuIndex >= menus.length - 3;
          return (
            <div key={menu.id} className="relative flex flex-1 min-w-0 overflow-visible">
              <button
                type="button"
                onClick={() => setOpenMenu(isOpen ? null : menu.id)}
                className="flex w-full min-w-0 items-center justify-center gap-1 px-1 h-full cursor-pointer transition-colors"
                style={{
                  color: active || isOpen ? "#fff" : "#c5cdd6",
                  background: active || isOpen ? "rgba(0,0,0,0.25)" : "transparent",
                  borderBottom: active ? "2px solid #5eb8e8" : "2px solid transparent",
                }}
              >
                <span className="shrink-0">{menu.icon}</span>
                <span className="truncate">{menu.label}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 opacity-80 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div
                  className={`panel-nav-dropdown absolute top-full z-[250] w-max max-w-[min(92vw,520px)] py-2 shadow-2xl rounded-b max-h-[min(70vh,420px)] overflow-y-auto ${
                    alignRight ? "right-0 left-auto" : "left-0"
                  }`}
                  style={{
                    background: "#252a2f",
                    border: "1px solid #1a1e22",
                    borderTop: "2px solid #5eb8e8",
                    minWidth: groups.length > 1 ? 320 : 220,
                  }}
                >
                  <div
                    className={
                      groups.length > 1
                        ? "grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-1"
                        : "block"
                    }
                  >
                    {groups.map((group, gi) => (
                      <div key={gi} className="px-1">
                        {group.section && (
                          <div
                            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: "#5eb8e8" }}
                          >
                            {group.section}
                          </div>
                        )}
                        {group.items.map((item) => {
                          const itemActive = pathActive(pathname, item.href);
                          return (
                            <Link
                              key={`${menu.id}-${item.href}`}
                              href={item.href}
                              className="flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors"
                              style={{
                                color: itemActive ? "#fff" : "#b8c0c8",
                                background: itemActive ? "rgba(94,184,232,0.2)" : "transparent",
                              }}
                            >
                              {item.icon && <span className="shrink-0">{item.icon}</span>}
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      )}
    </header>
  );
}

function StatPill({
  icon,
  value,
  title,
  compact,
  className = "",
}: {
  icon: React.ReactNode;
  value: string;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`panel-header-stat ${compact ? "panel-header-stat--compact" : ""} ${className}`.trim()}
      title={title}
    >
      <span>{icon}</span>
      <span>{value}</span>
    </span>
  );
}

/** Admin horizontal top navigation (from `getAdminSidebarNav`). */
export function nexlifyAdminNav(): { links: { href: string; label: string; icon: React.ReactNode }[]; menus: TopNavMenu[] } {
  return sidebarNavToTopNav(getAdminSidebarNav());
}

export function nexlifyResellerNav() {
  return getResellerPanelNav();
}

/** @deprecated Use nexlifyAdminNav */
export const nexstreamAdminNav = nexlifyAdminNav;

/** @deprecated Use nexlifyResellerNav */
export const nexstreamResellerNav = nexlifyResellerNav;
