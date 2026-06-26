"use client";



import Link from "next/link";

import { usePathname } from "next/navigation";

import { useEffect, useState } from "react";

import { ChevronLeft } from "lucide-react";

import {
  getAdminSidebarNav,
  type SidebarNavEntry,
  type SidebarNavGroup,
} from "@/lib/admin-sidebar-nav";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { withSidebarItemIcons } from "@/lib/panel-nav-bridge";
import { PanelBrandMark } from "@/components/panel-brand-mark";



function pathActive(pathname: string, href: string) {

  return pathname === href || pathname.startsWith(`${href}/`);

}



function groupActive(pathname: string, group: SidebarNavGroup) {

  return group.items.some((i) => pathActive(pathname, i.href));

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



function activeGroupIds(pathname: string, entries: SidebarNavEntry[]): Set<string> {

  const next = new Set<string>();

  for (const entry of entries) {

    if (entry.kind === "group" && groupActive(pathname, entry.group)) {

      next.add(entry.group.id);

    }

  }

  return next;

}



function SidebarGroup({

  group,

  pathname,

  open,

  onToggle,

  onNavigate,

}: {

  group: SidebarNavGroup;

  pathname: string;

  open: boolean;

  onToggle: () => void;

  onNavigate: () => void;

}) {

  const active = groupActive(pathname, group);

  return (

    <div className="mb-0.5">

      <button

        type="button"

        onClick={onToggle}

        className={`panel-nav-group-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
          active ? "panel-nav-group-btn--active" : ""
        } ${open && !active ? "panel-nav-group-btn--open" : ""}`}
      >

        <span className="shrink-0">{group.icon}</span>

        <span className="flex-1 text-left truncate">{group.label}</span>

        <ChevronLeft

          size={16}

          className="shrink-0 opacity-70 transition-transform duration-200"

          style={{ transform: open ? "rotate(-90deg)" : "none" }}

        />

      </button>

      {open && (

        <div
          className="sidebar-submenu-open ml-4 pl-3 border-l mb-1 space-y-1"
          style={{ borderColor: "rgba(255,255,255,0.12)" }}
        >

          {groupItemsBySection(group.items).map((section) => (

            <div key={section.section ?? "_default"}>

              {section.section && (

                <div className="panel-nav-section-label px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  {section.section}
                </div>

              )}

              {section.items.map((item) => {

                const itemActive = pathActive(pathname, item.href);

                return (

                  <Link

                    key={item.href}

                    href={item.href}

                    onClick={onNavigate}

                    className={`panel-nav-sub-link flex items-center gap-2 px-3 py-2 rounded-md text-sm truncate hover:translate-x-0.5 ${
                      itemActive ? "panel-nav-sub-link--active" : ""
                    }`}
                  >

                    {item.icon && <span className="shrink-0">{item.icon}</span>}

                    <span className="truncate">{item.label}</span>

                  </Link>

                );

              })}

            </div>

          ))}

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
}: {
  entries: SidebarNavEntry[];
  className?: string;
  onNavigate?: () => void;
  brand?: string;
  brandHref?: string;
}) {

  const pathname = usePathname();

  const [openIds, setOpenIds] = useState<Set<string>>(() => activeGroupIds(pathname, entries));



  // On route change, open only the group that contains the current page.
  useEffect(() => {
    setOpenIds(activeGroupIds(pathname, entries));
  }, [pathname, entries]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      // Accordion: one sidebar section open at a time.
      return new Set([id]);
    });
  }



  function onChildNavigate() {

    onNavigate?.();

  }



  const displayOpenIds = openIds;



  return (

    <aside className={`panel-sidebar ${className}`}>
      {brand && (
        <div className="panel-sidebar-brand">
          <PanelBrandMark name={brand} href={brandHref} size="sm" />
        </div>
      )}
      <nav className="panel-sidebar-nav flex-1 space-y-0.5">

        {entries.map((entry) => {

          if (entry.kind === "link") {

            const active = pathActive(pathname, entry.link.href);

            return (

              <Link

                key={entry.link.href}

                href={entry.link.href}

                onClick={onChildNavigate}

                className={`panel-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 ${
                  active ? "panel-nav-link--active" : ""
                }`}
              >

                <span className="shrink-0">{entry.link.icon}</span>

                <span className="truncate">{entry.link.label}</span>

              </Link>

            );

          }

          return (

            <SidebarGroup

              key={entry.group.id}

              group={entry.group}

              pathname={pathname}

              open={displayOpenIds.has(entry.group.id)}

              onToggle={() => toggle(entry.group.id)}

              onNavigate={onChildNavigate}

            />

          );

        })}

      </nav>

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
    <PanelSidebar
      entries={withSidebarItemIcons(getAdminSidebarNav())}
      brand={brand}
      brandHref={brandHref}
    />
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
    <PanelSidebar
      entries={withSidebarItemIcons(getResellerSidebarNav())}
      brand={brand}
      brandHref={brandHref}
    />
  );
}

