"use client";

import { MAG_BOX_MODELS } from "@/lib/mag-models";

export function MagModelSelect({
  value,
  onChange,
  className = "",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <select
      className={className}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select model…</option>
      {MAG_BOX_MODELS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
