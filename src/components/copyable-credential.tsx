"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

export function CopyableCredential({
  value,
  label,
  masked = false,
  className = "",
}: {
  value: string;
  label?: string;
  /** When true, value is hidden until revealed (password-style). */
  masked?: boolean;
  className?: string;
}) {
  const [show, setShow] = useState(!masked);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const display = masked && !show ? "••••••••" : value;

  return (
    <span className={`inline-flex items-center gap-1.5 max-w-full ${className}`}>
      {label ? (
        <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      ) : null}
      <code
        className="text-xs truncate font-mono"
        title={value}
        data-1p-ignore
      >
        {display}
      </code>
      {masked ? (
        <button
          type="button"
          className="p-1 rounded opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          style={{ color: "var(--muted)" }}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      ) : null}
      <button
        type="button"
        className="p-1 rounded opacity-70 hover:opacity-100 cursor-pointer shrink-0"
        style={{ color: copied ? "#22c55e" : "var(--muted)" }}
        onClick={() => void copy()}
        aria-label="Copy"
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  );
}
