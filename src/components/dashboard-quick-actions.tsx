"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Clock,
  KeyRound,
  Play,
  Plus,
  Radio,
  Server,
  ShoppingBag,
  Users,
  Wifi,
} from "lucide-react";

const ACTIONS = [
  { href: "/admin/lines/add", label: "Add line", icon: Plus, color: "#38bdf8" },
  { href: "/admin/streams/add", label: "Add stream", icon: Play, color: "#22c55e" },
  { href: "/admin/connections", label: "Live connections", icon: Wifi, color: "#22d3ee" },
  { href: "/admin/lines", label: "Expiring lines", icon: Clock, color: "#f59e0b" },
  { href: "/admin/stream_errors", label: "Down streams", icon: AlertTriangle, color: "#f97316" },
  { href: "/admin/streaming/health", label: "Health", icon: Activity, color: "#a78bfa" },
  { href: "/admin/servers", label: "Servers", icon: Server, color: "#94a3b8" },
  { href: "/admin/radios", label: "Radio", icon: Radio, color: "#ec4899" },
  { href: "/admin/settings/api", label: "Admin API", icon: KeyRound, color: "#14b8a6" },
  { href: "/admin/shop", label: "Shop", icon: ShoppingBag, color: "#eab308" },
  { href: "/admin/lines", label: "Manage lines", icon: Users, color: "#64748b" },
];

export function DashboardQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <Link
          key={`${a.href}-${a.label}`}
          href={a.href}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <a.icon size={14} style={{ color: a.color }} />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
