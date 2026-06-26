"use client";

import { useState } from "react";

function normalizeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function PanelLicenseKeyForm({
  submitLabel,
  hint,
  onSuccess,
}: {
  submitLabel: string;
  hint?: string;
  onSuccess?: () => void;
}) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeKey(key);
    if (!normalized.startsWith("NXLF1.")) {
      setMsgIsError(true);
      setMsg("Paste the full license key (starts with NXLF1.).");
      return;
    }
    if (normalized.length < 80) {
      setMsgIsError(true);
      setMsg("Key looks incomplete.");
      return;
    }
    setMsg("Processing…");
    setMsgIsError(false);
    const res = await fetch("/api/license/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ licenseKey: normalized }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsgIsError(true);
      setMsg(data.error ?? data.hint ?? "Failed");
      return;
    }
    setMsg("Success.");
    setMsgIsError(false);
    setKey("");
    onSuccess?.();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      {hint && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      )}
      <label className="block text-sm">
        License key
        <textarea
          className="mt-1 w-full min-h-[120px] font-mono text-xs rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="NXLF1.eyJ2IjoxLC…"
          required
          spellCheck={false}
        />
      </label>
      <button
        type="submit"
        className="btn-positive rounded px-4 py-2 text-sm font-medium cursor-pointer"
      >
        {submitLabel}
      </button>
      {msg && (
        <p
          className="text-sm rounded px-3 py-2"
          style={{
            color: msgIsError ? "#fff" : "inherit",
            background: msgIsError ? "var(--danger, #b91c1c)" : "transparent",
          }}
        >
          {msg}
        </p>
      )}
    </form>
  );
}
