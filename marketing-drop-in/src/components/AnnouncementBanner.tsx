"use client";

import { useState, useEffect } from "react";
import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
};

const TYPE_CONFIG: Record<
  string,
  {
    shell: string;
    iconWrap: string;
    icon: React.ReactNode;
    title: string;
    body: string;
  }
> = {
  info: {
    shell:
      "border-violet-500/35 bg-gradient-to-r from-violet-950/95 via-[#1a1030] to-orange-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconWrap: "bg-violet-500/15 ring-1 ring-violet-400/30",
    icon: <Info size={18} className="text-violet-300" aria-hidden />,
    title: "text-white",
    body: "text-violet-100/90",
  },
  warning: {
    shell:
      "border-amber-500/35 bg-gradient-to-r from-amber-950/95 via-[#241a0a] to-orange-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconWrap: "bg-amber-500/15 ring-1 ring-amber-400/30",
    icon: <AlertTriangle size={18} className="text-amber-300" aria-hidden />,
    title: "text-amber-50",
    body: "text-amber-100/90",
  },
  success: {
    shell:
      "border-emerald-500/35 bg-gradient-to-r from-emerald-950/95 via-[#0a1f18] to-teal-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconWrap: "bg-emerald-500/15 ring-1 ring-emerald-400/30",
    icon: <CheckCircle size={18} className="text-emerald-300" aria-hidden />,
    title: "text-emerald-50",
    body: "text-emerald-100/90",
  },
  error: {
    shell:
      "border-rose-500/35 bg-gradient-to-r from-rose-950/95 via-[#2a0a12] to-red-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconWrap: "bg-rose-500/15 ring-1 ring-rose-400/30",
    icon: <AlertCircle size={18} className="text-rose-300" aria-hidden />,
    title: "text-rose-50",
    body: "text-rose-100/90",
  },
};

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements ?? []))
      .catch(() => {});
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div className="w-full space-y-0">
      {visible.map((a) => {
        const config = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.info;
        return (
          <div
            key={a.id}
            role="region"
            aria-label={a.title}
            className={`relative border-b ${config.shell}`}
          >
            <div className="mx-auto max-w-3xl px-12 py-4 text-center md:px-16 md:py-5">
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-2.5">
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconWrap}`}
                >
                  {config.icon}
                </span>
                <p className={`font-display text-base font-bold leading-snug md:text-lg ${config.title}`}>
                  {a.title}
                </p>
                <p className={`text-sm leading-relaxed md:text-[15px] ${config.body}`}>{a.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white md:right-5"
              aria-label="Dismiss announcement"
            >
              <X size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
