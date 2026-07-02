"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setSent(true);
  }

  return (
    <div className="mesh-bg flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="font-display text-center text-2xl font-bold text-white">
          Reset password
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--muted)]">
          Enter your email and we will send you a reset link
        </p>

        {sent ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-sm text-cyan-100">
              If an account exists for <strong>{email}</strong>, we have sent a password reset link.
            </p>
            <p className="text-xs text-[var(--muted)]">
              Check your inbox (and spam folder). The link expires in 1 hour.
            </p>
            <Link
              href="/login"
              className="inline-block text-sm text-violet-400 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-violet-600 to-violet-500 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="text-center text-sm text-slate-500">
              <Link href="/login" className="text-violet-400 hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
