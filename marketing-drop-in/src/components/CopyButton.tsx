"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
