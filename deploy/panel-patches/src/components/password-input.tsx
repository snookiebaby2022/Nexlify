"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  className = "",
  showCopy = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  showCopy?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        tabIndex={-1}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-60 hover:opacity-100 cursor-pointer"
        style={{ color: "var(--muted)" }}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
      <input
        type={show ? "text" : "password"}
        required={required}
        placeholder={placeholder}
        className={`w-full rounded border pl-10 bg-transparent text-sm ${
          showCopy ? "pr-16" : "pr-3"
        } py-2.5`}
        style={{ borderColor: "var(--border)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {showCopy && value ? (
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-60 hover:opacity-100 cursor-pointer"
          style={{ color: copied ? "#22c55e" : "var(--muted)" }}
          onClick={() => void copy()}
          aria-label="Copy password"
          title="Copy"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
      ) : null}
    </div>
  );
}
