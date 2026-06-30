"use client";

import Link from "next/link";
import {
  Shield,
  Smartphone,
  Mail,
  Coins,
  Trophy,
  Layers,
  Server,
  Globe,
  Wrench,
} from "lucide-react";

const SETUP_SECTIONS = [
  {
    title: "Panel & billing",
    items: [
      { href: "/admin/settings/general", label: "General settings" },
      { href: "/admin/settings/billing", label: "WHMCS & PayPal" },
      { href: "/admin/settings/notifications", label: "Email & SMTP" },
      { href: "/admin/settings/white-label", label: "White-label portal" },
    ],
  },
  {
    title: "Streaming infrastructure",
    items: [
      { href: "/admin/servers/install", label: "Install stream server" },
      { href: "/admin/settings/server", label: "Server & ports" },
      { href: "/admin/settings/binaries", label: "FFmpeg & binaries" },
      { href: "/admin/settings/streams", label: "Streaming options" },
      { href: "/admin/servers/load-balancer", label: "Load balancer" },
    ],
  },
  {
    title: "Content & devices",
    items: [
      { href: "/admin/epg/sources", label: "EPG sources" },
      { href: "/admin/bouquets/templates", label: "Bouquet templates" },
      { href: "/admin/devices", label: "MAG & Enigma2 center" },
      { href: "/admin/import/migrate", label: "Panel migration" },
    ],
  },
];

const FEATURES = [
  {
    icon: Shield,
    title: "AI Copilot Security",
    desc: "Analytics + AI insights monitor logs for fraud, suspicious IP jumps, and compromised reseller accounts.",
    href: "/admin/analytics/insights",
  },
  {
    icon: Smartphone,
    title: "Universal Devices",
    desc: "M3U playlists, MAG/Stalker portals, Enigma2 devices, and Active Code API for mobile apps.",
    href: "/admin/devices",
  },
  {
    icon: Mail,
    title: "Automated Client Emails",
    desc: "HTML welcome emails with login links when lines are created — configure SMTP under Notifications.",
    href: "/admin/settings/notifications",
  },
  {
    icon: Coins,
    title: "Advanced Billing Logs",
    desc: "Immutable credit audit trail for every add, deduct, and refund.",
    href: "/admin/resellers/credits",
  },
  {
    icon: Trophy,
    title: "Live Sports Integration",
    desc: "Dashboard widget — add multiple sports API URLs under Settings → General → Live Sports.",
    href: "/admin/settings/general#live-sports",
  },
  {
    icon: Layers,
    title: "Bouquet Templates",
    desc: "Package templates load complex bouquet selections in one click during line creation.",
    href: "/admin/bouquets/templates",
  },
];

export default function ServiceSetupPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Initial configuration</p>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wrench size={20} /> Service Setup
          </h1>
        </div>
        <Link href="/admin/settings/general" className="text-sm px-3 py-1.5 rounded border border-white/60 text-white hover:bg-white/10">
          Open settings
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className="rounded-xl border p-5 hover:border-cyan-500/40 transition-colors block"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <f.icon size={22} style={{ color: "#22c55e" }} className="mb-3" />
            <h2 className="font-semibold mb-2">{f.title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {f.desc}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {SETUP_SECTIONS.map((sec) => (
          <div
            key={sec.title}
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              {sec.title === "Panel & billing" && <Globe size={16} />}
              {sec.title === "Streaming infrastructure" && <Server size={16} />}
              {sec.title === "Content & devices" && <Layers size={16} />}
              {sec.title}
            </h3>
            <ul className="space-y-2 text-sm">
              {sec.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline" style={{ color: "var(--accent)" }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
