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
    icon: <Info size={16} className="text-blue-400" />,
  },
  warning: {
    bg: "bg-yellow-900/60",
    border: "border-yellow-500/30",
    icon: <AlertTriangle size={16} className="text-yellow-400" />,
  },
  success: {
    bg: "bg-green-900/60",
    border: "border-green-500/30",
    icon: <CheckCircle size={16} className="text-green-400" />,
  },
  error: {
    bg: "bg-red-900/60",
    border: "border-red-500/30",
    icon: <AlertCircle size={16} className="text-red-400" />,
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
            className={`${config.bg} ${config.border} border-b px-4 py-2.5 flex items-center justify-between gap-3`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {config.icon}
              <span className="text-xs font-semibold text-white shrink-0">{a.title}</span>
              <span className="text-xs text-gray-300 truncate">{a.message}</span>
            </div>
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
              className="text-gray-400 hover:text-white shrink-0 p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
