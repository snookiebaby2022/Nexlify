"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  Play,
  Plus,
  Radio,
  Search,
  Server,
  ShoppingBag,
  Gauge,
  Users,
  Wifi,
} from "lucide-react";

const STORAGE_KEY = "nexlify-dashboard-quick-actions";

const ACTIONS = [
  { href: "/admin/lines/add", label: "Add line", icon: Plus, color: "#38bdf8" },
  { href: "/admin/streams/add", label: "Add stream", icon: Play, color: "#22c55e" },
  { href: "/admin/connections", label: "Live connections", icon: Wifi, color: "#22d3ee" },
  { href: "/admin/lines", label: "Expiring lines", icon: Clock, color: "#f59e0b" },
  { href: "/admin/stream_errors?kind=dead", label: "Down streams", icon: AlertTriangle, color: "#f97316" },
  { href: "/admin/diagnostics", label: "Diagnostics", icon: Gauge, color: "#f59e0b" },
  { href: "/admin/streaming/health", label: "Health", icon: Activity, color: "#a78bfa" },
  { href: "/admin/servers", label: "Servers", icon: Server, color: "#94a3b8" },
  { href: "/admin/radios", label: "Radio", icon: Radio, color: "#ec4899" },
  { href: "/admin/find", label: "Find a feature", icon: Search, color: "#a3e635" },
  { href: "/admin/streams/capture", label: "Capture / CCTV", icon: Radio, color: "#fb7185" },
  { href: "/admin/player/multiview", label: "Multi-view", icon: Play, color: "#38bdf8" },
  { href: "/admin/settings/fingerprint", label: "Overlay watermark", icon: AlertTriangle, color: "#f472b6" },
  { href: "/admin/shop", label: "Shop", icon: ShoppingBag, color: "#eab308" },
  { href: "/admin/lines", label: "Manage lines", icon: Users, color: "#64748b" },
];

export function DashboardQuickActions() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        aria-expanded={open}
      >
        <ChevronDown
          size={14}
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
        Quick actions
      </button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-2">
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
      ) : null}
    </div>
  );
}
