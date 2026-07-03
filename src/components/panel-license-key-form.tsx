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
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"key" | "code">("key");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  async function requestCode() {
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
    setLoading(true);
    setMsg("Sending activation code to your email…");
    setMsgIsError(false);
    try {
      const res = await fetch("/api/license/send-activation-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ licenseKey: normalized }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsgIsError(true);
        setMsg(data.error ?? "Failed to send code");
        return;
      }
      setMaskedEmail(data.email ?? "");
      setStep("code");
      setMsg(`A 6-digit code was sent to ${data.email ?? "your email"}.`);
      setMsgIsError(false);
    } catch {
      setMsgIsError(true);
      setMsg("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setMsgIsError(true);
      setMsg("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    setMsg("Activating…");
    setMsgIsError(false);
    const normalized = normalizeKey(key);
    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ licenseKey: normalized, activationCode: code.trim() }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      let data: { error?: string; hint?: string; status?: unknown } = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        setMsgIsError(true);
        setMsg(
          res.ok
            ? "Unexpected server response — try again or contact support."
            : text.slice(0, 120) || `Activation failed (HTTP ${res.status})`,
        );
        return;
      }
      if (!res.ok) {
        setMsgIsError(true);
        setMsg(data.error ?? data.hint ?? "Failed");
        return;
      }
      setMsg("Success — license activated. Redirecting…");
      setMsgIsError(false);
      setKey("");
      setCode("");
      setStep("key");
      onSuccess?.();
    } catch {
      setMsgIsError(true);
      setMsg("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={step === "key" ? (e) => { e.preventDefault(); requestCode(); } : activate}
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
          disabled={step === "code"}
        />
      </label>
      {step === "code" && (
        <label className="block text-sm">
          6-digit activation code
          <input
            className="mt-1 w-full font-mono text-lg tracking-[0.3em] text-center rounded border px-3 py-3 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoFocus
            required
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Sent to {maskedEmail || "your email"}. Code expires in 15 minutes.
          </p>
        </label>
      )}
      <div className="flex gap-2">
        {step === "code" && (
          <button
            type="button"
            className="rounded px-4 py-2 text-sm font-medium cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => { setStep("key"); setCode(""); setMsg(""); }}
          >
            Back
          </button>
        )}
        <button
          type="submit"
          className="btn-positive rounded px-4 py-2 text-sm font-medium cursor-pointer"
          disabled={loading}
        >
          {loading ? "Working…" : step === "key" ? "Continue" : submitLabel}
        </button>
        {step === "code" && (
          <button
            type="button"
            className="rounded px-4 py-2 text-sm cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => { setMsg(""); requestCode(); }}
            disabled={loading}
          >
            Resend code
          </button>
        )}
      </div>
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
