"use client";

import { useState } from "react";

export function AutoLogosButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/streams/auto-logos", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `Updated ${data.updated ?? 0} of ${data.scanned ?? 0} channels without logos`
        : data.error ?? "Failed"
    );
  }

  return (
    <div className="text-sm space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="rounded px-4 py-2 cursor-pointer border disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        {busy ? "Fetching logos…" : "Apply logos to channels missing icons"}
      </button>
      {msg && <p style={{ color: "var(--muted)" }}>{msg}</p>}
    </div>
  );
}
