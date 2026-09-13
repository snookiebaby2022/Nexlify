"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

export function CopyableCredential({
  value,
  label,
  masked = false,
  className = "",
  resolveValue,
}: {
  value: string;
  label?: string;
  /** When true, value is hidden until revealed (password-style). */
  masked?: boolean;
  className?: string;
  /** Load the secret on reveal/copy (C-05 list rows omit passwords). */
  resolveValue?: () => Promise<string>;
}) {
  const [show, setShow] = useState(!masked);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(value);
  const [busy, setBusy] = useState(false);

  async function secret(): Promise<string> {
    if (loaded) return loaded;
    if (!resolveValue) return value;
    setBusy(true);
    try {
      const next = await resolveValue();
      setLoaded(next);
      return next;
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const ok = await copyToClipboard(await secret());
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const display = masked && !show ? "••••••••" : loaded || (busy ? "…" : value);

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
          onClick={() => {
            void (async () => {
              if (!show) await secret();
              setShow((s) => !s);
            })();
          }}
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
