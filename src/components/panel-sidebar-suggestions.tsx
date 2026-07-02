"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";

export function PanelSidebarSuggestions() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function sendSuggestion() {
    const text = message.trim();
    if (!text) {
      setError("Please describe your suggestion.");
      return;
    }
    if (text.length < 10) {
      setError("Suggestion must be at least 10 characters.");
      return;
    }

    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Suggestion from panel user",
          body: text,
          priority: "NORMAL",
          category: "SUGGESTION",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send suggestion");
        return;
      }
      setMsg("Suggestion sent! Thank you for your feedback.");
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setMsg("");
      }, 2200);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMsg("");
          setError("");
        }}
        className="panel-sidebar-report-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
        title="Send a suggestion or feature request"
      >
        <Lightbulb size={18} className="shrink-0" style={{ color: "#a78bfa" }} />
        <span className="truncate">Suggestions</span>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-suggestion-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm cursor-pointer"
              aria-label="Close"
              onClick={() => !busy && setOpen(false)}
            />
            <div
              className="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
            >
              <h2 id="panel-suggestion-title" className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                Send a suggestion
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Have an idea to improve the panel? Send it directly to the admin team as a support ticket.
              </p>

              <label
                className="mt-4 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Your suggestion
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={2000}
                disabled={busy}
                placeholder="Describe your idea or feature request..."
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm resize-y min-h-[5rem]"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {message.length}/2000 characters
              </p>

              {error && (
                <p
                  className="mt-3 text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", color: "var(--danger)" }}
                >
                  {error}
                </p>
              )}
              {msg && (
                <p
                  className="mt-3 text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", color: "var(--success)" }}
                >
                  {msg}
                </p>
              )}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm cursor-pointer disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--bg)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !message.trim()}
                  onClick={sendSuggestion}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #a78bfa, #8b5cf6)" }}
                >
                  {busy ? "Sending…" : "Send suggestion"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
