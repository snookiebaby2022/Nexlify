"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

const VARIANTS = {
  green: {
    bg: "linear-gradient(135deg, #00a65a 0%, #008d4c 100%)",
    iconBg: "rgba(255,255,255,0.2)",
    text: "#fff",
    sub: "rgba(255,255,255,0.85)",
  },
  blue: {
    bg: "linear-gradient(135deg, #00c0ef 0%, #0097bc 100%)",
    iconBg: "rgba(255,255,255,0.2)",
    text: "#fff",
    sub: "rgba(255,255,255,0.85)",
  },
  orange: {
    bg: "linear-gradient(135deg, #f39c12 0%, #db8b0b 100%)",
    iconBg: "rgba(255,255,255,0.2)",
    text: "#fff",
    sub: "rgba(255,255,255,0.85)",
  },
  light: {
    bg: "linear-gradient(135deg, #f4f4f4 0%, #e8e8e8 100%)",
    iconBg: "rgba(0,0,0,0.06)",
    text: "#1a1a1a",
    sub: "rgba(0,0,0,0.55)",
  },
} as const;

export function DashboardStatBox({
  variant,
  value,
  label,
  icon,
  href,
  footerLabel = "More info",
}: {
  variant: keyof typeof VARIANTS;
  value: string;
  label: string;
  icon: ReactNode;
  href: string;
  footerLabel?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <div
      className="rounded shadow-md overflow-hidden flex flex-col min-h-[7.5rem]"
      style={{ background: v.bg, color: v.text }}
    >
      <div className="flex items-start justify-between p-4 pb-2 flex-1">
        <div>
          <div className="text-3xl font-bold tabular-nums leading-none">{value}</div>
          <div className="text-sm mt-2 font-medium" style={{ color: v.sub }}>
            {label}
          </div>
        </div>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
          style={{ background: v.iconBg }}
        >
          <span className="opacity-95">{icon}</span>
        </div>
      </div>
      <Link
        href={href}
        className="px-4 py-2.5 text-sm font-medium flex items-center justify-between border-t transition-opacity hover:opacity-90"
        style={{
          borderColor: variant === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.2)",
          color: v.sub,
        }}
      >
        {footerLabel}
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
