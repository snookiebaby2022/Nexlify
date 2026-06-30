"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/help", label: "Help & FAQ" },
  { href: "/install", label: "Panel installer" },
  { href: "/support", label: "Create a ticket" },
  { href: "/terms", label: "Terms and conditions" },
  { href: "/refund-policy", label: "Refund policy" },
];

export function SupportNav({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCapableRef = useRef(true);

  useEffect(() => {
    hoverCapableRef.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const frame = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onMouseEnter={() => {
        if (hoverCapableRef.current) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapableRef.current) setOpen(false);
      }}
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 hover:text-violet-300 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Support
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] pt-2" role="menu" aria-label="Support">
          <div className="min-w-[12rem] rounded-xl border border-white/10 bg-[#12101f] py-2 shadow-xl">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                className="block px-4 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const SUPPORT_NAV_LINKS = links;

export function SupportFooterLinks() {
  return (
    <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="hover:text-white transition-colors">
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
