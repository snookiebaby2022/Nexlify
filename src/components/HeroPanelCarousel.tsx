"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_PANEL_URL } from "@/lib/demo";
import {
  PanelConnectionsSlide,
  PanelDashboardSlide,
  PanelMagSlide,
  PanelResellerSlide,
  PanelSubscriptionsSlide,
  PanelVideoManagementSlide,
} from "@/components/demo/panel-slide-views";

const SLIDES = [
  {
    id: "dashboard",
    title: "Dashboard",
    caption: "Most watched by country, expiring lines, subscriptions, and live connections.",
    View: PanelDashboardSlide,
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    caption: "Lines, packages, mass edit, and line activity.",
    View: PanelSubscriptionsSlide,
  },
  {
    id: "mag",
    title: "MAG & Enigma",
    caption: "MAC-only device registration and convert-to-line.",
    View: PanelMagSlide,
  },
  {
    id: "video",
    title: "Video management",
    caption: "On-demand VOD sources — probe playback, import M3U, edit, and delete.",
    View: PanelVideoManagementSlide,
  },
  {
    id: "connections",
    title: "Live connections",
    caption: "Kick sessions and monitor what lines are watching.",
    View: PanelConnectionsSlide,
  },
  {
    id: "reseller",
    title: "Reseller panel",
    caption: "Full sub-user, credit, and ticket workflow for resellers.",
    View: PanelResellerSlide,
  },
] as const;

const INTERVAL_MS = 5500;

type HeroPanelCarouselProps = {
  showDemoLink?: boolean;
};

export function HeroPanelCarousel({ showDemoLink = true }: HeroPanelCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const t = setInterval(() => go(index + 1), INTERVAL_MS);
    return () => clearInterval(t);
  }, [index, paused, go]);

  const slide = SLIDES[index];
  const View = slide.View;

  return (
    <div
      className="relative w-full min-h-[440px] max-w-lg lg:max-w-xl"
      data-panel-carousel
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="mb-3 flex items-end justify-between gap-3 px-1"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            IPTV panel preview
          </p>
          <h2 className="font-display text-lg font-semibold text-white" data-slide-title>
            {slide.title}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{slide.caption}</p>
        </div>
        <a
          href={DEMO_PANEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20 transition-colors"
        >
          Open live demo
        </a>
      </div>

      <div className="relative overflow-hidden rounded-2xl">
        <div
          key={slide.id}
          className="animate-fade-slide"
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${SLIDES.length}: ${slide.title}`}
        >
          <View />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Panel views">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.title}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-violet-400" : "w-2 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            →
          </button>
        </div>
      </div>

      {showDemoLink && (
        <p className="mt-3 text-center text-[10px] text-[var(--muted)]">
          Automated preview ·{" "}
          <Link href="/demo" className="text-violet-400 hover:underline">
            Full demo walkthrough
          </Link>
        </p>
      )}
    </div>
  );
}
