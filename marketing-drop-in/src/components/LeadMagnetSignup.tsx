"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

type LeadMagnetSignupProps = {
  /** Logged to newsletter webhook / file for segmentation. */
  sequence?: string;
};

export function LeadMagnetSignup({ sequence = "become-a-reseller" }: LeadMagnetSignupProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source: "reseller-starter-guide-pdf",
          sequence,
        }),
      });
      if (!res.ok) throw new Error("failed");
      trackEvent("lead_magnet_signup", {
        sequence,
        email_domain: email.split("@")[1] ?? "",
      });
      setStatus("ok");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="font-semibold text-emerald-400">Check your inbox</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We&apos;ll send the IPTV Reseller Starter Guide (PDF) shortly. Meanwhile,{" "}
          <Link href="/register?trial=1" className="text-violet-400 hover:text-violet-300 underline">
            start your 7-day trial
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-8">
      <h2 className="font-display text-xl font-bold text-white">
        IPTV Reseller Starter Guide (PDF)
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Free download — WHMCS setup checklist, VPS sizing, and your first 100 lines playbook.
        Join the become-a-reseller email sequence (no spam).
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="lead-magnet-email">
          Email for reseller starter guide
        </label>
        <input
          id="lead-magnet-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@reseller.com"
          className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60 sm:py-2.5"
        >
          {status === "loading" ? "…" : "Get the PDF"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-3 text-xs text-red-400">Could not subscribe. Email support@nexlify.live</p>
      )}
    </form>
  );
}
