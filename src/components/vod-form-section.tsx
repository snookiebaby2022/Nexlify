"use client";

import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useState } from "react";

export function VodFormSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold cursor-pointer"
        style={{ background: "rgba(94,184,232,0.12)", color: "var(--accent)" }}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export function VodYesNo({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1 mb-1" style={{ color: "var(--muted)" }}>
        {label}
        {hint && (
          <span title={hint}>
            <Info size={14} />
          </span>
        )}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}
