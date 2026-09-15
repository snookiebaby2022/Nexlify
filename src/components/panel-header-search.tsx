"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { coloredIcon } from "@/lib/nav-item-icons";
import { getAdminSidebarNav, type SidebarNavEntry } from "@/lib/admin-sidebar-nav";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { searchPanelPages, type PanelSearchHit } from "@/lib/panel-page-search";
import { usePanelI18n } from "@/lib/i18n/use-panel-i18n";
import { useResellerGroupFlags } from "@/components/reseller-group-flags-context";

export function PanelHeaderSearch({ role }: { role: "ADMIN" | "RESELLER" }) {
  const { t } = usePanelI18n();
  const router = useRouter();
  const flags = useResellerGroupFlags();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries: SidebarNavEntry[] = useMemo(
    () => (role === "ADMIN" ? getAdminSidebarNav() : getResellerSidebarNav(flags)),
    [role, flags]
  );

  const hits = useMemo(() => searchPanelPages(query, role, entries), [query, role, entries]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(hit: PanelSearchHit) {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active] ?? hits[0];
      if (hit) go(hit);
    }
  }

  const showMenu = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        className="p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        aria-label={t("searchPanel")}
      >
        {coloredIcon(Search, "#22d3ee", 18)}
      </button>
      <div className={`panel-header-search ${open ? "flex" : "hidden sm:flex"}`}>
        {coloredIcon(Search, "#22d3ee", 18)}
        <input
          ref={inputRef}
          type="search"
          placeholder={t("searchPanel")}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {showMenu && (
        <div
          className="absolute right-0 top-full mt-1.5 w-[min(92vw,22rem)] rounded-lg shadow-2xl z-[260] overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          role="listbox"
        >
          {hits.length === 0 ? (
            <div className="px-3 py-3 text-sm" style={{ color: "var(--muted)" }}>
              {t("noSearchResults")}
            </div>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.href}-${hit.label}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className="w-full text-left px-3 py-2.5 text-sm cursor-pointer"
                style={{ background: i === active ? "rgba(94,184,232,0.16)" : "transparent" }}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
              >
                <span className="block font-medium">{t(hit.label)}</span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {t(hit.group)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
