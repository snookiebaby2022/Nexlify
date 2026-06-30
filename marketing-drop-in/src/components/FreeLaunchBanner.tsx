"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

const FREE_PERIOD_END = "2026-08-01";
const FREE_BANNER_KEY = "nexlify_free_banner_dismissed";

function getDaysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function FreeLaunchBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FREE_BANNER_KEY) === "1") return;
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(FREE_BANNER_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const daysLeft = getDaysUntil(FREE_PERIOD_END);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[70] border-b border-amber-500/40 bg-gradient-to-r from-amber-950 via-[#1a0f00] to-orange-950 shadow-lg shadow-black/40"
      role="region"
      aria-label="Free launch promotion"
      data-nx-free-banner
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2.5">
        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Limited Time
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">
              {daysLeft > 0 ? `${daysLeft} days left` : "Ends today"}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-white sm:text-base">
            <span className="font-bold text-amber-300">All licenses are free</span> until{" "}
            <span className="text-amber-200">August 1, 2026</span> — no coupon needed
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/pricing"
            onClick={() => trackEvent("free_banner_click", { page: "global" })}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
          >
            Claim free license →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Dismiss promotion"
          >
            <span className="text-xl leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
