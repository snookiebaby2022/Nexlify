"use client";

import { useEffect, useState, type ReactNode } from "react";

const SCENES = [
  { id: "hook", dur: 3200 },
  { id: "login", dur: 6500 },
  { id: "dashboard", dur: 7000 },
  { id: "lines", dur: 6000 },
  { id: "connections", dur: 6000 },
  { id: "reseller", dur: 5500 },
  { id: "demo", dur: 4500 },
  { id: "cta", dur: 6500 },
] as const;

const DEMO_URL = "https://panel.demo.nexlify.live";
const LICENSE_URL = "https://nexlify.live";

type SceneId = (typeof SCENES)[number]["id"];

function SceneShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col px-5 pt-8 pb-10">
      {eyebrow && (
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">{eyebrow}</p>
      )}
      {title && <h2 className="mt-2 text-xl font-bold leading-tight text-white">{title}</h2>}
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </div>
  );
}

function MockBrowser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-cyan-500/20 shadow-2xl"
      style={{ background: "linear-gradient(180deg, #121a2e 0%, #0a0e17 100%)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 truncate rounded-md bg-black/30 px-2 py-0.5 text-[9px] text-cyan-300/90">
          {url}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ borderColor: `${color}33`, background: `${color}12` }}
    >
      <p className="text-[9px] uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function SceneContent({ scene }: { scene: SceneId }) {
  switch (scene) {
    case "hook":
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-orange-400">Nexlify · Live demo</p>
          <h1 className="mt-5 text-3xl font-black leading-[1.1] text-white">
            POV: you&apos;re
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              testing the panel
            </span>
          </h1>
          <p className="mt-4 text-sm text-white/65">60 seconds. No signup. Real UI.</p>
        </div>
      );

    case "login":
      return (
        <SceneShell eyebrow="Step 1" title="One-tap demo login">
          <MockBrowser url={DEMO_URL}>
            <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-400/30 to-blue-600/20" />
              <p className="text-sm font-semibold text-white">Sign in</p>
              <div className="w-full max-w-[220px] space-y-2">
                <div className="h-8 rounded-lg border border-white/10 bg-black/25" />
                <div className="h-8 rounded-lg border border-white/10 bg-black/25" />
              </div>
              <div className="w-full max-w-[220px] space-y-2 pt-2">
                <p className="text-center text-[9px] uppercase tracking-wider text-white/45">Try demo</p>
                <div className="demo-pulse grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-cyan-400/50 bg-cyan-500/15 py-2 text-[10px] font-bold text-cyan-200"
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 py-2 text-[10px] font-semibold text-white/75"
                  >
                    Reseller
                  </button>
                </div>
              </div>
            </div>
          </MockBrowser>
        </SceneShell>
      );

    case "dashboard":
      return (
        <SceneShell eyebrow="Step 2" title="Dashboard at a glance">
          <MockBrowser url={`${DEMO_URL}/admin/dashboard`}>
            <div className="grid h-full grid-cols-[72px_1fr] gap-0">
              <div className="border-r border-white/10 bg-black/20 p-1.5">
                <div className="mb-2 h-6 rounded bg-cyan-500/20" />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="mb-1.5 h-4 rounded bg-white/5" />
                ))}
              </div>
              <div className="space-y-2 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <StatBox label="Online streams" value="128 / 412" color="#22c55e" />
                  <StatBox label="Connections" value="89 / 500" color="#38bdf8" />
                  <StatBox label="Active lines" value="1.2k" color="#a78bfa" />
                  <StatBox label="Servers" value="4 / 4" color="#f97316" />
                </div>
                <div className="h-24 rounded-xl border border-white/10 bg-gradient-to-br from-cyan-900/20 to-transparent p-2">
                  <p className="text-[8px] text-white/45">Connection map</p>
                  <div className="relative mt-2 h-14 rounded-lg bg-[#0d1528]">
                    {[
                      { l: "22%", t: "35%" },
                      { l: "48%", t: "28%" },
                      { l: "65%", t: "55%" },
                      { l: "38%", t: "62%" },
                    ].map((p, i) => (
                      <span
                        key={i}
                        className="map-dot absolute h-2 w-2 rounded-full bg-cyan-400"
                        style={{ left: p.l, top: p.t }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </MockBrowser>
        </SceneShell>
      );

    case "lines":
      return (
        <SceneShell eyebrow="Step 3" title="Manage lines in seconds">
          <MockBrowser url={`${DEMO_URL}/admin/lines`}>
            <div className="p-2.5">
              <div className="mb-2 flex gap-2">
                <div className="h-7 flex-1 rounded-lg bg-orange-500/80 text-center text-[9px] font-bold leading-7 text-white">
                  + Add line
                </div>
                <div className="h-7 w-20 rounded-lg border border-white/15 text-center text-[9px] leading-7 text-white/60">
                  Mass edit
                </div>
              </div>
              {[
                { u: "client_4821", on: true, exp: "32d" },
                { u: "trial_mike", on: true, exp: "2d" },
                { u: "reseller_jo", on: false, exp: "Exp" },
                { u: "mag_lounge", on: true, exp: "90d" },
              ].map((row) => (
                <div
                  key={row.u}
                  className="mb-1.5 flex items-center justify-between rounded-lg border border-white/8 bg-black/20 px-2.5 py-2"
                >
                  <span className="font-mono text-[10px] text-white/90">{row.u}</span>
                  <span className="flex items-center gap-2 text-[9px]">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: row.on ? "#22c55e" : "#64748b" }}
                    />
                    <span className="text-white/50">{row.exp}</span>
                  </span>
                </div>
              ))}
            </div>
          </MockBrowser>
        </SceneShell>
      );

    case "connections":
      return (
        <SceneShell eyebrow="Step 4" title="See who&apos;s watching live">
          <MockBrowser url={`${DEMO_URL}/admin/connections`}>
            <div className="space-y-2 p-2.5">
              {[
                { line: "client_4821", ch: "Sky Sports HD", cc: "UK" },
                { line: "trial_mike", ch: "Netflix 4K", cc: "DE" },
                { line: "mag_lounge", ch: "BBC One", cc: "UK" },
              ].map((r) => (
                <div
                  key={r.line}
                  className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-2.5 py-2"
                >
                  <p className="font-mono text-[10px] font-semibold text-cyan-100">{r.line}</p>
                  <p className="text-[9px] text-white/55">
                    {r.ch} · {r.cc}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-center">
                <p className="text-2xl font-bold text-cyan-300">89</p>
                <p className="text-[9px] uppercase tracking-wide text-white/45">live connections</p>
              </div>
            </div>
          </MockBrowser>
        </SceneShell>
      );

    case "reseller":
      return (
        <SceneShell eyebrow="Step 5" title="Full reseller tree">
          <MockBrowser url={`${DEMO_URL}/reseller/dashboard`}>
            <div className="space-y-2 p-2.5">
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-3">
                <p className="text-[9px] uppercase text-white/50">Credits</p>
                <p className="text-2xl font-bold text-orange-300">2,450</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="My lines" value="186" color="#22c55e" />
                <StatBox label="Sub-users" value="12" color="#a78bfa" />
              </div>
              <p className="text-center text-[9px] text-white/45">Packages · MAG · Enigma · tickets</p>
            </div>
          </MockBrowser>
        </SceneShell>
      );

    case "demo":
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div
            className="rounded-2xl border px-5 py-4"
            style={{ borderColor: "rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.1)" }}
          >
            <p className="text-sm font-bold text-amber-300">Demo mode</p>
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              Explore the full UI read-only.
              <br />
              No risk to live data.
            </p>
          </div>
          <p className="mt-6 text-sm text-white/55">Switch Admin ↔ Reseller anytime</p>
        </div>
      );

    case "cta":
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-400">Try it now</p>
          <p className="mt-4 text-2xl font-black text-white">panel.demo.nexlify.live</p>
          <p className="mt-3 text-sm text-white/60">Admin · Reseller demo buttons on login</p>
          <a
            href={LICENSE_URL}
            className="mt-8 inline-flex w-full max-w-[280px] items-center justify-center rounded-2xl py-4 text-base font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #f97316, #ea580c)",
              boxShadow: "0 12px 40px rgba(249,115,22,0.4)",
            }}
          >
            Get your license →
          </a>
          <p className="mt-4 text-xs text-cyan-400/80">nexlify.live</p>
        </div>
      );

    default:
      return null;
  }
}

export function TikTokDemoWalkthrough() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const scene = SCENES[sceneIdx];
  const totalMs = SCENES.reduce((s, x) => s + x.dur, 0);

  useEffect(() => {
    const start = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const loopT = elapsed % totalMs;
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < SCENES.length; i++) {
        acc += SCENES[i].dur;
        if (loopT < acc) {
          idx = i;
          break;
        }
      }
      const sceneStart = SCENES.slice(0, idx).reduce((s, x) => s + x.dur, 0);
      const p = ((loopT - sceneStart) / SCENES[idx].dur) * 100;
      setSceneIdx(idx);
      setProgress(p);
    }, 50);
    return () => window.clearInterval(tick);
  }, [totalMs]);

  return (
    <div
      className="tiktok-demo-walkthrough fixed inset-0 z-[9999] overflow-hidden bg-[#060b14] text-white"
      style={{ height: "100dvh", width: "100vw" }}
    >
      <style>{`
        .tiktok-demo-walkthrough .scene-enter {
          animation: demoFadeIn 0.45s ease-out;
        }
        @keyframes demoFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tiktok-demo-walkthrough .demo-pulse button:first-child {
          animation: demoPulse 1.2s ease-in-out infinite;
        }
        @keyframes demoPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.5); }
          50% { box-shadow: 0 0 0 8px rgba(34,211,238,0); }
        }
        .tiktok-demo-walkthrough .map-dot {
          animation: mapBlink 1.8s ease-in-out infinite;
        }
        .tiktok-demo-walkthrough .map-dot:nth-child(2) { animation-delay: 0.3s; }
        .tiktok-demo-walkthrough .map-dot:nth-child(3) { animation-delay: 0.6s; }
        .tiktok-demo-walkthrough .map-dot:nth-child(4) { animation-delay: 0.9s; }
        @keyframes mapBlink {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>

      <div
        className="mx-auto flex h-full w-full max-w-[min(100vw,430px)] flex-col"
        style={{ aspectRatio: "9/16" }}
      >
        <div className="relative min-h-0 flex-1">
          <div key={scene.id} className="scene-enter absolute inset-0">
            <SceneContent scene={scene.id} />
          </div>
        </div>

        <div className="shrink-0 px-5 pb-6 pt-2">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-orange-400 transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-center text-[10px] text-white/40">
            Screen record this page · 9:16 · {Math.round(totalMs / 1000)}s loop
          </p>
        </div>
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-2 text-right">
        <a
          href="/promo/nexlify-tiktok-ad.mp4"
          download
          className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-cyan-300 backdrop-blur"
        >
          MP4
        </a>
      </div>
    </div>
  );
}
