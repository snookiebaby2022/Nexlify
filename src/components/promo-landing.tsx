"use client";

import { useCallback } from "react";

const LICENSE_URL = "https://nexlify.live";
const DEMO_URL = "https://panel.nexlify.live";

const BENEFITS = [
  {
    title: "Anti-freeze built in",
    desc: "Edge agents, fast zapping, and live monitoring — not a bolt-on plugin.",
  },
  {
    title: "PostgreSQL-native",
    desc: "Self-hosted stack. Migrate from XUI or 1-stream without vendor lock-in.",
  },
  {
    title: "Resellers + WHMCS",
    desc: "Credits, packages, and billing webhooks for real operator workflows.",
  },
] as const;

function appendUtm(base: string, utm: Record<string, string>, placement: string) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(utm)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("utm_content", utm.utm_content ?? placement);
  return url.toString();
}

type PromoLandingProps = {
  utm?: Record<string, string>;
};

export function PromoLanding({ utm = {} }: PromoLandingProps) {
  const trackCta = useCallback((placement: string, href: string) => {
    if (typeof window !== "undefined" && "umami" in window) {
      const umami = (window as Window & { umami?: { track: (e: string, d?: object) => void } }).umami;
      umami?.track("cta_click", { placement, href, ...utm });
    }
  }, [utm]);

  const licenseHref = appendUtm(LICENSE_URL, utm, "hero-license");
  const demoHref = appendUtm(DEMO_URL, utm, "hero-demo");

  return (
    <div
      className="promo-page-bg relative min-h-screen overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(165deg, #060b14 0%, #080d18 45%, #0f172a 100%)",
        color: "#eef4fc",
      }}
    >
      {/* Ambient glow */}
      <div
        className="promo-glow-orb pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2"
        style={{
          width: 480,
          height: 480,
          background: "radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 opacity-40"
        style={{
          width: 320,
          height: 320,
          background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8 max-w-lg mx-auto w-full text-center">
        {/* Logo mark */}
        <div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(8,145,178,0.1) 100%)",
            border: "1px solid rgba(34,211,238,0.3)",
            boxShadow: "0 0 40px rgba(34,211,238,0.2)",
          }}
        >
          <span
            className="text-2xl font-black tracking-tight"
            style={{ color: "#22d3ee", textShadow: "0 0 20px rgba(34,211,238,0.5)" }}
          >
            N
          </span>
        </div>

        <p
          className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-3"
          style={{ color: "#22d3ee" }}
        >
          IPTV panel for operators
        </p>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-3">
          Stream management,
          <br />
          <span style={{ color: "#22d3ee" }}>built for operators</span>
        </h1>

        <p className="text-sm sm:text-base mb-8 max-w-sm" style={{ color: "#8ba3c7" }}>
          Modern control panel vs legacy XUI. Self-hosted on PostgreSQL — anti-freeze, resellers, WHMCS-ready.
        </p>

        {/* Dual CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm mb-10">
          <a
            href={licenseHref}
            onClick={() => trackCta("hero-license", licenseHref)}
            className="promo-cta-primary inline-flex items-center justify-center px-6 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 50%, #fb923c 100%)",
              borderRadius: 9999,
              boxShadow: "0 4px 24px rgba(249,115,22,0.35)",
            }}
          >
            Get your license
          </a>
          <a
            href={demoHref}
            onClick={() => trackCta("hero-demo", demoHref)}
            className="promo-cta-secondary inline-flex items-center justify-center px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-white/5"
            style={{
              color: "#22d3ee",
              border: "1px solid rgba(34,211,238,0.4)",
              borderRadius: 9999,
            }}
          >
            Try free demo
          </a>
        </div>

        <p className="text-xs mb-8" style={{ color: "#64748b" }}>
          Demo login: <span className="font-mono text-slate-400">admin</span> /{" "}
          <span className="font-mono text-slate-400">admin123</span>
        </p>

        {/* Benefits */}
        <div className="w-full grid gap-3 text-left">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="promo-benefit-card rounded-xl p-4"
              style={{
                background: "#121a2e",
                border: "1px solid #243352",
              }}
            >
              <p className="text-sm font-semibold mb-1">{b.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "#8ba3c7" }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>

        <footer className="mt-10 text-xs" style={{ color: "#64748b" }}>
          <a
            href={licenseHref}
            className="hover:underline"
            style={{ color: "#22d3ee" }}
            onClick={() => trackCta("footer", licenseHref)}
          >
            nexlify.live
          </a>
          {" · "}
          <a
            href={demoHref}
            className="hover:underline"
            style={{ color: "#22d3ee" }}
            onClick={() => trackCta("footer-demo", demoHref)}
          >
            panel.nexlify.live
          </a>
        </footer>
      </main>
    </div>
  );
}
