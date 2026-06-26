"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PanelConnectionsSlide,
  PanelDashboardSlide,
  PanelVideoManagementSlide,
} from "@/components/demo/panel-slide-views";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { site } from "@/lib/site";

const SLIDE_MS = 3800;
const COUNTDOWN_MS = 3000;
const HOLD_MS = 4000;

type Slide = {
  id: string;
  hook: string;
  sub?: string;
  content: "dashboard" | "video" | "connections" | "pricing" | "cta";
};

const SLIDES: Slide[] = [
  {
    id: "hook",
    hook: "POV: you're building an IPTV reseller business",
    sub: "Real panel · WHMCS · 7-day trial",
    content: "dashboard",
  },
  {
    id: "dashboard",
    hook: "Admin dashboard your customers expect",
    sub: "Stats · lines · subscriptions",
    content: "dashboard",
  },
  {
    id: "vod",
    hook: "Video management built in",
    sub: "VOD · M3U · probe playback",
    content: "video",
  },
  {
    id: "live",
    hook: "Kick live sessions in one click",
    sub: "Monitor what lines are watching",
    content: "connections",
  },
  {
    id: "whmcs",
    hook: "WHMCS sells licenses automatically",
    sub: "Starter · Main · Top tier",
    content: "pricing",
  },
  {
    id: "cta",
    hook: "Try it free for 7 days",
    sub: `${site.domain} · link in bio`,
    content: "cta",
  },
];

function PanelPreview({ type }: { type: Slide["content"] }) {
  if (type === "video") {
    return (
      <div className="scale-[0.72] origin-top -mt-2">
        <PanelVideoManagementSlide />
      </div>
    );
  }
  if (type === "connections") {
    return (
      <div className="scale-[0.72] origin-top -mt-2">
        <PanelConnectionsSlide />
      </div>
    );
  }
  if (type === "pricing") {
    return (
      <div className="mt-4 space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">WHMCS ready</p>
        {["7-day trial — Free", "Starter — Reseller entry", "Main — Growth", "Top tier — Scale"].map(
          (line) => (
            <div
              key={line}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3"
            >
              <span className="text-sm text-white">{line.split(" — ")[0]}</span>
              <span className="text-xs text-[var(--muted)]">{line.split(" — ")[1]}</span>
            </div>
          ),
        )}
      </div>
    );
  }
  if (type === "cta") {
    return (
      <div className="mt-6 flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-500 text-2xl font-bold text-white shadow-xl">
          NX
        </div>
        <p className="font-display text-3xl font-bold text-white">{site.domain}</p>
        <p className="text-sm text-violet-200">panel.demo.nexlify.live</p>
        <div className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 text-sm font-bold text-slate-950">
          Start 7-day trial
        </div>
      </div>
    );
  }
  return (
    <div className="scale-[0.72] origin-top -mt-2">
      <PanelDashboardSlide />
    </div>
  );
}

export function TikTokPromo() {
  const [phase, setPhase] = useState<"idle" | "countdown" | "playing" | "hold">("idle");
  const [countdown, setCountdown] = useState(3);
  const [slideIndex, setSlideIndex] = useState(0);

  const start = useCallback(() => {
    setSlideIndex(0);
    setCountdown(3);
    setPhase("countdown");
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (slideIndex >= SLIDES.length - 1) {
      const t = setTimeout(() => setPhase("hold"), SLIDE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSlideIndex((i) => i + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [phase, slideIndex]);

  const slide = SLIDES[slideIndex];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black">
      {/* 9:16 TikTok frame */}
      <div
        className="relative flex h-full max-h-[100dvh] w-full max-w-[min(100vw,56.25dvh)] flex-col overflow-hidden bg-[#07070f]"
        style={{ aspectRatio: "9/16" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-950/40 via-transparent to-amber-950/20" />

        {phase === "idle" && (
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">TikTok recorder</p>
            <h1 className="font-display text-2xl font-bold text-white">
              Auto-play promo — screen record this
            </h1>
            <ol className="max-w-xs space-y-2 text-left text-sm text-[var(--muted)]">
              <li>1. Open TikTok → create → 15–60s video</li>
              <li>2. Start screen recording (phone or OBS)</li>
              <li>3. Tap Start below — don&apos;t touch the screen</li>
              <li>4. Stop recording when the CTA holds (~30s)</li>
              <li>5. Add trending sound in TikTok editor</li>
            </ol>
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-10 py-4 text-lg font-bold text-slate-950 shadow-xl"
            >
              Start recording
            </button>
            <details className="max-w-xs text-left text-xs text-[var(--muted)]">
              <summary className="cursor-pointer text-violet-400">Copy TikTok caption</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-slate-300">
                {`Built for IPTV resellers — panel software, not content.\n\n✅ Live demo in bio\n✅ WHMCS licenses\n✅ 7-day free trial\n\n${site.url}\n\n#iptv #iptvpanel #reseller #whmcs #vps #sidehustle`}
              </p>
            </details>
          </div>
        )}

        {(phase === "countdown" || phase === "playing" || phase === "hold") && (
          <div className="relative z-10 flex flex-1 flex-col px-4 pb-6 pt-10 animate-[fadeIn_0.4s_ease-out]">
            {phase === "countdown" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
                <span className="font-display text-8xl font-bold text-white animate-pulse">
                  {countdown || "Go"}
                </span>
              </div>
            )}

            <div className="mb-3 shrink-0">
              <p className="font-display text-xl font-bold leading-tight text-white drop-shadow-lg">
                {slide.hook}
              </p>
              {slide.sub ? (
                <p className="mt-1 text-sm text-violet-200/90">{slide.sub}</p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0c0c14]">
              <PanelPreview type={slide.content} />
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>{site.name}</span>
              <span>
                {slideIndex + 1}/{SLIDES.length}
              </span>
            </div>
          </div>
        )}

        {phase === "hold" && (
          <div className="absolute bottom-24 left-0 right-0 z-30 px-6 text-center">
            <p className="text-xs text-emerald-400 animate-pulse">Hold frame — stop recording now</p>
          </div>
        )}
      </div>

      {/* Copy-paste caption (idle only) */}
      {phase === "idle" && (
        <div className="absolute bottom-4 left-4 right-4 z-[210] mx-auto max-w-lg rounded-xl border border-white/10 bg-slate-900/95 p-4 text-xs text-slate-300 max-h-[28vh] overflow-y-auto hidden md:block">
          <p className="mb-2 font-semibold text-white">Caption (copy for TikTok):</p>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
{`Built for IPTV resellers — panel software, not content.

✅ Live demo in bio
✅ WHMCS licenses
✅ 7-day free trial

${site.url}

#iptv #iptvpanel #reseller #whmcs #vps #sidehustle #techbusiness`}
          </pre>
          <p className="mt-2 text-[var(--muted)]">
            Demo: {DEMO_PANEL_URL} · Trial: {site.url}/register?trial=1
          </p>
        </div>
      )}
    </div>
  );
}
