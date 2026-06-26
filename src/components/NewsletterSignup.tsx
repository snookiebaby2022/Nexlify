"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export function NewsletterSignup({ compact = false }: { compact?: boolean }) {
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
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("failed");
      trackEvent("newsletter_signup", { email_domain: email.split("@")[1] ?? "" });
      setStatus("ok");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <p className="text-sm text-emerald-400">
        Thanks — you&apos;re on the list for IPTV operator updates (worldwide).
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? "flex flex-col gap-2 sm:flex-row" : "space-y-3"}>
      <label className="sr-only" htmlFor="newsletter-email">
        Email for IPTV operator updates
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@reseller.com"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="shrink-0 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
      >
        {status === "loading" ? "…" : "Get updates"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400">Could not subscribe. Email support@nexlify.live</p>
      )}
    </form>
  );
}
