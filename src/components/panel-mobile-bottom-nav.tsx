"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMobileBottomNav } from "@/lib/panel-mobile-nav";

export function PanelMobileBottomNav({
  role,
  onMore,
}: {
  role: "ADMIN" | "RESELLER";
  onMore: () => void;
}) {
  const pathname = usePathname();
  const items = getMobileBottomNav(role);

  return (
    <nav className="panel-mobile-bottom-nav md:hidden" aria-label="Main navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.action === "more" ? false : item.match?.(pathname) ?? pathname === item.href;

        if (item.action === "more") {
          return (
            <button
              key={item.id}
              type="button"
              className="panel-mobile-bottom-nav-item"
              onClick={onMore}
              aria-label="Open full menu"
            >
              <Icon size={22} strokeWidth={1.75} />
              <span>{item.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href!}
            className={`panel-mobile-bottom-nav-item${active ? " panel-mobile-bottom-nav-item--active" : ""}`}
          >
            <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
