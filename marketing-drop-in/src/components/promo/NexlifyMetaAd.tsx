"use client";

import { NEXLIFY_LAUNCH_COUPON } from "@/lib/marketing-coupon";

const AD_WIDTH = 1200;
const AD_HEIGHT = 628;

function DashboardMockup() {
  return (
    <div
      className="relative w-[520px] shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-violet-950/60"
      style={{
        transform: "perspective(1200px) rotateY(8deg) rotateX(2deg)",
        background: "linear-gradient(180deg, #12101c 0%, #0a0812 100%)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="font-display text-sm font-bold text-white">nexlify</span>
        <span className="ml-auto rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1 text-[10px] font-semibold text-white">
          + New Line
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 p-4">
        <div>
          <h2 className="font-display text-[26px] font-bold leading-[1.05] tracking-tight text-white">
            IPTV reseller
            <br />
            panel
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
              management
            </span>
            <br />
            tool
          </h2>
        </div>

        <div className="w-[140px] space-y-2">
          <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
            <p className="text-[8px] text-slate-400">Live Connections</p>
            <p className="text-sm font-bold text-white">2,450</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
            <p className="text-[8px] text-slate-400">Connections by Status</p>
            <div className="mt-1 h-8 w-8 rounded-full border-4 border-violet-500 border-r-orange-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        {[
          { label: "Online Streams", value: "896" },
          { label: "Active Users", value: "1,203" },
          { label: "Connections", value: "2,450" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-2">
            <p className="text-[7px] text-slate-400">{s.label}</p>
            <p className="text-sm font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 px-4 py-3">
        <p className="mb-2 text-[9px] font-medium text-slate-300">Dashboard activity and monitor flows</p>
        <div className="grid grid-cols-3 gap-2 text-[7px]">
          <div className="rounded border border-white/5 p-1.5">
            <p className="mb-1 font-semibold text-slate-400">Active Lines</p>
            {["Line 1 · Online", "Line 2 · Online", "Line 3 · Buffering"].map((r) => (
              <p key={r} className="truncate text-slate-500">
                {r}
              </p>
            ))}
          </div>
          <div className="rounded border border-white/5 p-1.5">
            <p className="mb-1 font-semibold text-slate-400">Top Connections</p>
            {["US · 842", "GB · 621", "CA · 412"].map((r) => (
              <p key={r} className="text-slate-500">
                {r}
              </p>
            ))}
          </div>
          <div className="rounded border border-white/5 p-1.5">
            <p className="mb-1 font-semibold text-slate-400">Stream Status</p>
            <p className="text-emerald-400">Active 1,892</p>
            <p className="text-amber-400">Buffering 358</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/5 px-4 py-3">
        {[
          { label: "Total Users", value: "12,543" },
          { label: "Total Resellers", value: "1,234" },
          { label: "Total Lines", value: "456" },
          { label: "Total Streams", value: "2,450" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-white/5 bg-white/[0.02] px-1.5 py-1.5">
            <p className="text-[6px] text-slate-500">{s.label}</p>
            <p className="text-[10px] font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdArtboard() {
  return (
    <div
      className="relative flex overflow-hidden"
      style={{
        width: AD_WIDTH,
        height: AD_HEIGHT,
        background: "radial-gradient(ellipse 70% 80% at 30% 50%, rgba(88,28,135,0.35) 0%, transparent 55%), #06060f",
      }}
    >
      <div className="flex w-[58%] items-center justify-center pl-8">
        <DashboardMockup />
      </div>

      <div className="flex w-[42%] flex-col justify-center pr-10">
        <p className="mb-3 text-right text-xs font-semibold text-violet-300/80">Nexlify</p>
        <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-tight text-white">
          Replace Your
          <br />
          Legacy IPTV Panel
        </h1>
        <p className="mt-4 text-sm text-slate-400">
          WHMCS billing · Anti-Freeze · Reseller tools
        </p>
        <p className="mt-2 text-sm text-slate-500">Deploy on your own VPS in minutes.</p>
        <div
          className="mt-8 inline-flex w-fit items-center rounded-full px-8 py-3.5 text-base font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
        >
          Start Free Trial →
        </div>
        <p className="mt-4 text-lg font-semibold text-orange-400">nexlify.live</p>
        <div className="mt-4 inline-flex w-fit rounded-md bg-orange-500 px-4 py-2 text-sm font-bold tracking-wide text-white">
          USE CODE {NEXLIFY_LAUNCH_COUPON}
        </div>
      </div>
    </div>
  );
}

export function NexlifyMetaAd() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 overflow-auto bg-[#030308] px-4 py-8"
      style={{ minHeight: "100dvh" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-400">
        Nexlify · Meta ad · {AD_WIDTH}×{AD_HEIGHT}
      </p>

      <div className="overflow-hidden rounded-lg shadow-2xl">
        <AdArtboard />
      </div>

      <p className="max-w-lg text-center text-xs text-slate-500">
        Screenshot this artboard for Meta/Facebook ads.
      </p>
    </div>
  );
}
