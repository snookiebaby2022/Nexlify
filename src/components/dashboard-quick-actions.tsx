"use client";

import Link from "next/link";
import {
  Activity,
  Layers,
  Play,
  Radio,
  Server,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";

const ACTIONS = [
  { href: "/admin/content/streams", label: "Streams", icon: Play, color: "#22c55e" },
  { href: "/admin/lines", label: "Lines", icon: Users, color: "#38bdf8" },
  { href: "/admin/servers", label: "Servers", icon: Server, color: "#a78bfa" },
  { href: "/admin/streaming/health", label: "Health", icon: Activity, color: "#f97316" },
  { href: "/admin/servers/load-balancer", label: "Load balancer", icon: Layers, color: "#06b6d4" },
  { href: "/admin/streaming/transcoding", label: "Transcode", icon: Radio, color: "#ec4899" },
  { href: "/admin/settings/geo", label: "GeoIP", icon: Shield, color: "#14b8a6" },
  { href: "/admin/settings/binaries", label: "FFmpeg / GPU", icon: Wrench, color: "#eab308" },
  { href: "/admin/settings/general#live-sports", label: "Settings", icon: Settings, color: "#94a3b8" },
];

export function DashboardQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] hover:shadow-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <a.icon size={14} style={{ color: a.color }} />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
