"use client";

import { useEffect, useState } from "react";
import {
  applyLogoAccent,
  getStoredLogoAccent,
  LOGO_ACCENT_STORAGE_KEY,
  type LogoAccent,
} from "@/lib/logo-accent";

export function LogoAccentToggle({ className = "" }: { className?: string }) {
  const [accent, setAccent] = useState<LogoAccent>("blue");

  useEffect(() => {
    const initial = getStoredLogoAccent();
    setAccent(initial);
    applyLogoAccent(initial);
  }, []);

  function toggle() {
    const next: LogoAccent = accent === "blue" ? "red" : "blue";
    setAccent(next);
    localStorage.setItem(LOGO_ACCENT_STORAGE_KEY, next);
    applyLogoAccent(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`relative inline-flex h-7 w-[3.25rem] items-center rounded-full border p-0.5 cursor-pointer transition-colors ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "rgba(255,255,255,0.06)",
      }}
      title={accent === "blue" ? "Switch logo accent to red" : "Switch logo accent to blue"}
      aria-label="Toggle logo accent colour"
      aria-pressed={accent === "red"}
    >
      <span
        className="absolute left-1 text-[9px] font-bold uppercase tracking-wide"
        style={{ color: accent === "blue" ? "#38bdf8" : "var(--muted)" }}
      >
        B
      </span>
      <span
        className="absolute right-1 text-[9px] font-bold uppercase tracking-wide"
        style={{ color: accent === "red" ? "#f87171" : "var(--muted)" }}
      >
        R
      </span>
      <span
        className="h-5 w-5 rounded-full shadow-md transition-transform duration-200"
        style={{
          transform: accent === "red" ? "translateX(1.35rem)" : "translateX(0)",
          background:
            accent === "red"
              ? "linear-gradient(135deg, #f87171, #ef4444)"
              : "linear-gradient(135deg, #38bdf8, #22d3ee)",
        }}
      />
    </button>
  );
}
