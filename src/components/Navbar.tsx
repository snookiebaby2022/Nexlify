"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUPPORT_NAV_LINKS } from "@/components/SupportNav";
import type { SessionUser } from "@/lib/auth";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { FACEBOOK_URL, TELEGRAM_CHANNEL_URL } from "@/lib/marketing-constants";
import { site } from "@/lib/site";

const NAV_LINKS = [
  { href: "/webplayer", label: "Web Player" },
  { href: "/epg", label: "EPG" },
  { href: "/install", label: "Install" },
  { href: "/requirements", label: "Requirements" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pricing#plugins", label: "Plugins" },
  { href: "/updates", label: "Updates" },
];

const MOBILE_EXTRA_LINKS = [
  { href: DEMO_PANEL_URL, label: "Live demo", external: true },
  { href: "/demo", label: "Panel demo" },
  { href: TELEGRAM_CHANNEL_URL, label: "Telegram channel", external: true },
  { href: FACEBOOK_URL, label: "Facebook", external: true },
];

export function Navbar({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:h-16 md:py-0">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-display font-semibold tracking-tight">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-amber-500 text-sm font-bold text-white shadow-lg shadow-violet-500/25">
            NX
          </span>
          <span className="truncate text-white">{site.name}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-sm text-[var(--muted)]">
          <a
            href={DEMO_PANEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 font-medium text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition-all"
            data-track="demo_click"
            data-track-label="nav_try_demo"
          >
            Try demo
          </a>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-violet-300 transition-colors">
              {link.label}
            </Link>
          ))}
          <SupportNavDesktop />
          <AuthNavDesktop user={user} />
        </nav>

        <button
          type="button"
          className="md:hidden inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-white hover:border-violet-400/40 hover:text-violet-200 transition-colors"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <MenuIcon open /> : <MenuIcon open={false} />}
        </button>
      </div>

      {open && (
        <nav
          className="md:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 bg-[#0c0818]/98 px-4 py-4"
          aria-label="Mobile site menu"
        >
          <div className="flex flex-col gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            <p className="mt-2 px-3 text-xs uppercase tracking-wider text-slate-500">Support</p>
            {SUPPORT_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            {MOBILE_EXTRA_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg px-3 py-3 text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                  onClick={close}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-3 text-[var(--muted)] hover:bg-white/5 hover:text-white transition-colors"
                  onClick={close}
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="rounded-lg px-3 py-3 text-white hover:bg-white/5 transition-colors"
                    onClick={close}
                  >
                    Licenses
                  </Link>
                  {user.role === "ADMIN" && (
                    <Link
                      href="/admin"
                      className="rounded-lg px-3 py-3 text-amber-300 hover:bg-white/5 transition-colors"
                      onClick={close}
                    >
                      Admin panel
                    </Link>
                  )}
                  <Link
                    href="/admin/profile"
                    className="rounded-lg px-3 py-3 text-white hover:bg-white/5 transition-colors"
                    onClick={close}
                  >
                    Profile
                  </Link>
                  <form action="/api/auth/logout" method="POST">
                    <button
                      type="submit"
                      className="w-full min-h-[44px] rounded-lg border border-white/15 px-3 py-3 text-left text-slate-300 hover:border-violet-400/40 hover:text-white transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-3 py-3 text-white hover:bg-white/5 transition-colors"
                    onClick={close}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="min-h-[44px] rounded-full bg-violet-600 px-4 py-3 text-center font-semibold text-white hover:bg-violet-500 transition-colors"
                    onClick={close}
                  >
                    Start 7-day trial
                  </Link>
                </>
              )}
              <a
                href={DEMO_PANEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-center font-medium text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition-all"
                onClick={close}
                data-track="demo_click"
                data-track-label="mobile_nav_try_demo"
              >
                Try demo
              </a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

function SupportNavDesktop() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 hover:text-violet-300 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
      >
        Support
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] pt-2" role="menu" aria-label="Support">
          <div className="min-w-[12rem] rounded-xl border border-white/10 bg-[#12101f] py-2 shadow-xl">
            {SUPPORT_NAV_LINKS.map((link) => (
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

function AuthNavDesktop({ user }: { user: SessionUser | null }) {
  if (user) {
    return (
      <>
        <Link href="/dashboard" className="hover:text-white transition-colors">
          Licenses
        </Link>
        {user.role === "ADMIN" && (
          <Link href="/admin" className="text-amber-300 hover:text-amber-200 transition-colors">
            Admin
          </Link>
        )}
        <Link href="/admin/profile" className="hover:text-white transition-colors">
          Profile
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="rounded-full border border-white/15 px-4 py-1.5 text-slate-300 hover:border-violet-400/40 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="hover:text-white transition-colors">
        Sign in
      </Link>
      <Link
        href="/pricing"
        className="rounded-full border border-white/15 px-4 py-2 font-medium text-slate-200 hover:border-violet-400/50 hover:bg-white/5 transition-all"
      >
        Pricing
      </Link>
    </>
  );
}


function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
