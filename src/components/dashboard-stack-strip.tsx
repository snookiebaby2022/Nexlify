"use client";

import Link from "next/link";
import { Globe, Gpu, Radio, Server, Zap } from "lucide-react";
import type { StackComponentStatus } from "@/lib/nexlify-stack";

const ICONS: Record<string, typeof Server> = {
  nginx: Server,
  ffmpeg: Radio,
  gpu: Gpu,
  geo: Globe,
};

export function DashboardStackStrip({ items }: { items: StackComponentStatus[] }) {
  if (!items.length) return null;

  return (
    <section
      className="rounded-xl border px-4 py-3"
      style={{
        borderColor: "var(--border)",
        background: "linear-gradient(90deg, rgba(0,192,239,0.08) 0%, rgba(168,85,247,0.06) 100%)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Streaming stack
        </p>
        <Link href="/admin/streaming/engine" className="text-xs underline" style={{ color: "var(--accent)" }}>
          Engine details
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? Zap;
          const chip = (
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
              style={{
                borderColor: item.ok ? "rgba(34,197,94,0.35)" : "rgba(251,191,36,0.4)",
                background: item.ok ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)",
              }}
              title={item.detail}
            >
              <Icon size={14} className={item.ok ? "text-green-400" : "text-amber-400"} />
              <span className="font-medium">{item.label}</span>
              {item.version && <span className="opacity-70 tabular-nums">{item.version}</span>}
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: item.ok ? "#22c55e" : "#fbbf24" }}
              />
            </span>
          );
          return item.href ? (
            <Link key={item.id} href={item.href} className="hover:opacity-90">
              {chip}
            </Link>
          ) : (
            <span key={item.id}>{chip}</span>
          );
        })}
      </div>
    </section>
  );
}
