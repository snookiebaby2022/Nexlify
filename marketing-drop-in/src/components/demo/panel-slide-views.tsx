import type { ReactNode } from "react";
import { PanelChrome } from "@/components/demo/PanelChrome";

function StatGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
        >
          <p className="text-[10px] text-[var(--muted)]">{s.label}</p>
          <p className="font-display text-base font-semibold text-white md:text-lg">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="mt-3 rounded-xl border border-white/5 overflow-hidden">
      <div
        className="grid gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] font-medium uppercase text-[var(--muted)]"
        style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}
      >
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid gap-2 border-b border-white/5 px-3 py-2 text-xs last:border-0"
          style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}
        >
          {row.map((cell, j) => (
            <span key={j} className="text-slate-300 truncate">
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const COUNTRY_WATCH = [
  {
    flag: "🇬🇧",
    name: "United Kingdom",
    channels: [
      ["BBC News HD", 304],
      ["ITV 2 HD", 107],
      ["BBC One FHD", 105],
      ["More4 FHD", 63],
      ["BBC Two HD", 46],
    ],
  },
  {
    flag: "🇺🇸",
    name: "United States",
    channels: [
      ["CNN HD", 142],
      ["ESPN HD", 98],
      ["Fox News HD", 76],
      ["NBC HD", 54],
      ["CBS HD", 41],
    ],
  },
  {
    flag: "🇮🇪",
    name: "Ireland",
    channels: [
      ["Discovery Hi…", 109],
      ["CNBC HD", 81],
      ["RTE One FHD", 9],
    ],
  },
] as const;

const XUI_SUMMARY_CARDS = [
  {
    title: "Expiring Lines",
    total: 24,
    gradient: "from-amber-500 to-orange-600",
    rows: [
      ["This week", 8, 33, "bg-amber-500"],
      ["This month", 16, 67, "bg-orange-500"],
    ],
  },
  {
    title: "Subscriptions",
    total: 367,
    gradient: "from-emerald-600 to-green-700",
    rows: [
      ["Online", 8, 2, "bg-emerald-500"],
      ["Enabled", 367, 100, "bg-sky-500"],
      ["Expired", 16, 4, "bg-red-500"],
    ],
  },
  {
    title: "Connections",
    total: 8,
    gradient: "from-violet-600 to-indigo-700",
    rows: [
      ["Lines", 8, 100, "bg-emerald-500"],
      ["Devices", 0, 0, "bg-sky-500"],
      ["Restreamers", 0, 0, "bg-violet-500"],
    ],
  },
] as const;

function MockMostWatchedByCountry() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-200">Most Watched By Country</p>
        <span className="text-[10px] text-[var(--muted)]">↻</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {COUNTRY_WATCH.map((c) => (
          <div
            key={c.name}
            className="w-[108px] shrink-0 rounded-lg border border-white/5 bg-black/20 p-2"
          >
            <div className="mb-1.5 flex items-center gap-1 border-b border-white/5 pb-1.5">
              <span className="text-sm">{c.flag}</span>
              <span className="truncate text-[9px] font-medium text-slate-300">{c.name}</span>
            </div>
            <ul className="space-y-0.5">
              {c.channels.map(([name, count]) => (
                <li key={name} className="flex justify-between gap-1 text-[8px]">
                  <span className="truncate text-[var(--muted)]">{name}</span>
                  <span className="shrink-0 font-semibold text-slate-200">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockXuiSummaryCards({ compact }: { compact?: boolean }) {
  const cards = compact ? XUI_SUMMARY_CARDS.slice(0, 2) : XUI_SUMMARY_CARDS;
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"}`}>
      {cards.map((card) => (
        <div key={card.title} className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
          <div className={`bg-gradient-to-br ${card.gradient} px-2.5 py-2 text-white`}>
            <p className="text-[8px] font-medium opacity-90">{card.title}</p>
            <p className="font-display text-base font-bold">{card.total.toLocaleString()}</p>
          </div>
          <div className="space-y-1.5 p-2">
            {card.rows.map(([label, value, pct, bar]) => (
              <div key={label}>
                <div className="mb-0.5 flex justify-between text-[8px]">
                  <span className="text-[var(--muted)]">
                    {label} ({typeof value === "number" ? value.toLocaleString() : value})
                  </span>
                  <span className="font-medium text-slate-300">{pct}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PanelDashboardSlide() {
  return (
    <PanelChrome activeNav="Dashboard" compact>
      <StatGrid
        stats={[
          { label: "Online streams", value: "412 / 480" },
          { label: "Online users", value: "8 / 367" },
          { label: "Connections", value: "8 / ∞" },
          { label: "Servers", value: "6 / 6" },
        ]}
      />
      <div className="mt-3 space-y-3">
        <MockMostWatchedByCountry />
        <MockXuiSummaryCards />
      </div>
    </PanelChrome>
  );
}

export function PanelWhmcsBillingSlide() {
  return (
    <PanelChrome
      activeNav="Products"
      compact
      subtitle="billing.nexlify.live — WHMCS automation"
      navItems={["Clients", "Orders", "Products", "Licenses", "Invoices", "Addons"]}
    >
      <StatGrid
        stats={[
          { label: "Auto-provisioned", value: "24 / 24" },
          { label: "Active licenses", value: "367" },
          { label: "Due renewal", value: "12" },
          { label: "Suspended", value: "3" },
        ]}
      />
      <DataTable
        headers={["Order", "Product", "License", "Status"]}
        rows={[
          ["#10482", "Main · Monthly", "NX-8f2a…", <span className="text-emerald-400">Active</span>],
          ["#10481", "Starter · Annual", "NX-1c9d…", <span className="text-emerald-400">Active</span>],
          ["#10479", "Top Tier · Mo", "NX-7b44…", <span className="text-amber-400">Renewing</span>],
          ["#10475", "Main · Monthly", "NX-3e91…", <span className="text-red-400">Suspended</span>],
        ]}
      />
    </PanelChrome>
  );
}

export function PanelResellerSlide() {
  return (
    <PanelChrome
      activeNav="Dashboard"
      compact
      subtitle="Reseller panel — scoped to your lines"
      navItems={["Dashboard", "Lines", "MAG", "Sub-users", "Credits", "Tickets"]}
    >
      <StatGrid
        stats={[
          { label: "My lines", value: "148" },
          { label: "Active", value: "132" },
          { label: "Connections", value: "89" },
          { label: "Credits", value: "2,400" },
        ]}
      />
      <div className="mt-3 space-y-3">
        <MockMostWatchedByCountry />
        <MockXuiSummaryCards compact />
      </div>
    </PanelChrome>
  );
}

export function PanelSubscriptionsSlide() {
  return (
    <PanelChrome
      activeNav="Subscriptions"
      compact
      navItems={["Dashboard", "Subscriptions", "Lines", "MAG", "Enigma2", "Settings"]}
    >
      <p className="text-xs font-medium text-violet-300">Subscriptions · Lines</p>
      <DataTable
        headers={["Username", "Package", "Expires", "Status"]}
        rows={[
          ["line_8842", "Premium EU", "2026-12-01", <span className="text-emerald-400">Active</span>],
          ["reseller_joe_12", "Sports", "2026-08-15", <span className="text-emerald-400">Active</span>],
          ["mag_user_09", "MAG Bundle", "2026-06-30", <span className="text-emerald-400">Active</span>],
          ["trial_441", "Trial", "2026-06-10", <span className="text-amber-400">Expiring</span>],
        ]}
      />
    </PanelChrome>
  );
}

export function PanelMagSlide() {
  return (
    <PanelChrome activeNav="MAG" compact navItems={["Dashboard", "MAG", "Enigma2", "Lines", "Settings"]}>
      <p className="text-xs font-medium text-violet-300">MAG &amp; Enigma devices</p>
      <DataTable
        headers={["MAC", "Line", "Model", "Status"]}
        rows={[
          ["00:1A:79:44:2C:01", "mag_user_09", "MAG 322", <span className="text-emerald-400">Online</span>],
          ["00:1A:79:88:10:AF", "line_8842", "MAG 524", <span className="text-emerald-400">Online</span>],
          ["00:1A:79:12:9B:44", "trial_441", "Enigma2", <span className="text-slate-400">Offline</span>],
        ]}
      />
    </PanelChrome>
  );
}

export function PanelConnectionsSlide() {
  return (
    <PanelChrome activeNav="Connections" compact navItems={["Dashboard", "Connections", "Lines", "Streams"]}>
      <StatGrid
        stats={[
          { label: "Live sessions", value: "8" },
          { label: "Unique lines", value: "7" },
          { label: "Avg bitrate", value: "4.2 Mbps" },
          { label: "Countries", value: "5" },
        ]}
      />
      <DataTable
        headers={["Line", "Channel", "IP", "Duration"]}
        rows={[
          ["line_8842", "BBC One HD", "82.12.x.x", "01:24:08"],
          ["reseller_joe_12", "Sky Sports PL", "104.28.x.x", "00:42:15"],
          ["mag_user_09", "ITV 2 HD", "86.14.x.x", "00:18:03"],
        ]}
      />
    </PanelChrome>
  );
}

export function PanelVideoManagementSlide() {
  return (
    <PanelChrome
      activeNav="VOD"
      compact
      navItems={["Dashboard", "Live", "VOD", "Series", "Import"]}
    >
      <p className="text-xs font-medium text-violet-300">Video management · On-demand</p>
      <DataTable
        headers={["Title", "Category", "Source", "Status"]}
        rows={[
          ["Inception (2010)", "Movies", "TMDB", <span className="text-emerald-400">Ready</span>],
          ["Breaking Bad S01", "Series", "M3U import", <span className="text-emerald-400">Ready</span>],
          ["Planet Earth II", "Documentary", "Probe URL", <span className="text-amber-400">Indexing</span>],
        ]}
      />
    </PanelChrome>
  );
}

export function PanelMigrationSlide() {
  return (
    <PanelChrome activeNav="Import" compact navItems={["Dashboard", "Import", "Lines", "Streams", "Settings"]}>
      <p className="text-xs font-medium text-violet-300">Import → Panel migration</p>
      <div className="mt-2 space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
        <p className="text-slate-300">
          Source: <strong className="text-white">XUI.one</strong>
        </p>
        <p className="text-slate-400">Lines mapped: 842 · Bouquets: 12 · Resellers: 8</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="rounded-full bg-violet-600/40 px-2.5 py-1 text-[10px] font-semibold text-violet-100">
            Preview ready
          </span>
          <span className="rounded-full border border-emerald-500/40 px-2.5 py-1 text-[10px] text-emerald-300">
            Dry-run passed
          </span>
        </div>
      </div>
      <DataTable
        headers={["Entity", "Source", "Target", "Status"]}
        rows={[
          ["Lines", "840", "840", <span className="text-emerald-400">OK</span>],
          ["Bouquets", "12", "12", <span className="text-emerald-400">OK</span>],
          ["Resellers", "8", "8", <span className="text-emerald-400">OK</span>],
          ["Categories", "24", "24", <span className="text-emerald-400">OK</span>],
        ]}
      />
    </PanelChrome>
  );
}
