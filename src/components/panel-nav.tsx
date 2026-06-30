"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
};

export type NavSection = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  items: NavLink[];
};

export type NavTopItem = NavLink & { icon?: React.ReactNode };

export function PanelNav({
  topItems,
  sections,
}: {
  topItems: NavTopItem[];
  sections: NavSection[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const section of sections) {
      if (section.items.some((i) => pathname.startsWith(i.href))) {
        next[section.id] = true;
      }
    }
    setOpen((prev) => ({ ...prev, ...next }));
  }, [pathname, sections]);

  function toggle(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
      {topItems.map((item) => (
        <NavRow key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname.startsWith(item.href)} />
      ))}

      {sections.map((section) => {
        const isOpen = open[section.id] ?? false;
        const sectionActive = section.items.some((i) => pathname.startsWith(i.href));

        return (
          <div key={section.id} className="pt-1">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer"
              style={{
                color: sectionActive ? "var(--text)" : "var(--muted)",
                background: sectionActive && !isOpen ? "var(--bg-hover)" : "transparent",
              }}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {section.icon}
              <span className="font-medium">{section.label}</span>
            </button>
            {isOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: "var(--border)" }}>
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href, section.items.map((i) => i.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block px-3 py-1.5 rounded-md text-sm"
                      style={{
                        background: active ? "var(--bg-hover)" : "transparent",
                        color: active ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Avoid /admin/servers highlighting when on /admin/servers/streams */
function isNavActive(pathname: string, href: string, siblings: string[]) {
  if (!pathname.startsWith(href)) return false;
  const hasMoreSpecific = siblings.some(
    (s) => s !== href && s.startsWith(href + "/") && pathname.startsWith(s)
  );
  return !hasMoreSpecific;
}

function NavRow({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
      style={{
        background: active ? "var(--bg-hover)" : "transparent",
        color: active ? "var(--text)" : "var(--muted)",
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
