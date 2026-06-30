"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FACEBOOK_URL, TELEGRAM_CHANNEL_URL } from "@/lib/marketing-constants";

const links = [
  { href: "/webplayer", label: "Web Player" },
  { href: "/epg", label: "EPG" },
  { href: "https://panel.demo.nexlify.live/", label: "Live demo", external: true },
  { href: "/install", label: "Install panel" },
  { href: "/requirements", label: "Requirements" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pricing#plugins", label: "Plugins" },
  { href: "/help", label: "Help & FAQ" },
  { href: "/updates", label: "Updates" },
  { href: "/demo", label: "Panel demo" },
  { href: TELEGRAM_CHANNEL_URL, label: "Telegram channel", external: true, track: "telegram_click", trackLabel: "mobile_nav_telegram_channel" },
  { href: FACEBOOK_URL, label: "Facebook", external: true, track: "facebook_click", trackLabel: "mobile_nav_facebook" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} className="relative md:hidden">
      <button
        type="button"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-white hover:border-violet-400/40 hover:text-violet-200 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open menu"
      >
        <span className="sr-only">Menu</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] pt-2" role="menu" aria-label="Site menu">
          <div className="min-w-[11rem] rounded-xl border border-white/10 bg-[#12101f] py-2 shadow-xl">
            {links.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="block px-4 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                  {...(link.track
                    ? { "data-track": link.track, "data-track-label": link.trackLabel }
                    : {})}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  className="block px-4 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
