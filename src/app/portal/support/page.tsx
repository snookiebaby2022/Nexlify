"use client";

import { useState } from "react";
import Link from "next/link";

export default function PortalSupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send support request");
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen text-white p-8" style={{ background: "#0a1628" }}>
      <div className="max-w-lg mx-auto space-y-4">
        <Link href="/portal/dashboard" className="text-sm" style={{ color: "#22d3ee" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Support</h1>
        <p className="text-sm" style={{ color: "#94a3b8" }}>
          Open a ticket for your provider. Include your line username and device model.
        </p>

        {sent ? (
          <p className="text-sm rounded border p-4" style={{ borderColor: "#1e3a5f", color: "#94a3b8" }}>
            Thank you. Your support request has been sent to your provider.
            For urgent issues, contact them using the support channel from your welcome email.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm">
              <span style={{ color: "#94a3b8" }}>Subject</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "#1e3a5f" }}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: "#94a3b8" }}>Message</span>
              <textarea
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent min-h-[120px]"
                style={{ borderColor: "#1e3a5f" }}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            {error && (
              <p className="text-sm rounded border p-3" style={{ borderColor: "#7f1d1d", color: "#f87171" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{ background: "#22d3ee", color: "#0a1628" }}
              disabled={busy}
            >
              {busy ? "Sending…" : "Submit ticket"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
