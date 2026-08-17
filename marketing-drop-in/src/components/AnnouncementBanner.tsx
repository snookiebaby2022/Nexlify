"use client";

import { useState, useEffect } from "react";
import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
};

const TYPE_CONFIG: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: "bg-blue-900/60",
    border: "border-blue-500/30",
    icon: <Info size={40} className="text-blue-400" />,
  },
  warning: {
    bg: "bg-yellow-900/60",
    border: "border-yellow-500/30",
    icon: <AlertTriangle size={40} className="text-yellow-400" />,
  },
  success: {
    bg: "bg-green-900/60",
    border: "border-green-500/30",
    icon: <CheckCircle size={40} className="text-green-400" />,
  },
  error: {
    bg: "bg-red-900/60",
    border: "border-red-500/30",
    icon: <AlertCircle size={40} className="text-red-400" />,
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
    <div className="w-full space-y-1">
      {visible.map((a) => {
        const config = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.info;
        return (
          <div
            key={a.id}
            className={`${config.bg} ${config.border} border-b px-6 py-8 md:px-12 md:py-10 flex items-center justify-between gap-5`}
          >
            <div className="flex items-center gap-5 min-w-0">
              <span className="shrink-0 [&_svg]:w-10 [&_svg]:h-10">{config.icon}</span>
              <div className="min-w-0">
                <span className="block text-xl md:text-2xl font-bold text-white leading-snug">{a.title}</span>
                <span className="block text-base md:text-lg text-gray-100 mt-2 leading-relaxed">{a.message}</span>
              </div>
            </div>
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
              className="text-gray-300 hover:text-white shrink-0 p-3"
              aria-label="Dismiss announcement"
            >
              <X size={28} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
