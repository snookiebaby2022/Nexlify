"use client";

import { useState } from "react";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not open billing portal");
        setLoading(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={loading}
        className="rounded-full border border-cyan-500/40 px-5 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
      >
        {loading ? "Opening…" : "Manage billing / update card"}
      </button>
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}
