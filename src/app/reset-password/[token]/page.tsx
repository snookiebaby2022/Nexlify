"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/login"), 3000);
  }

  return (
    <div className="mesh-bg flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="font-display text-center text-2xl font-bold text-white">
          {done ? "Password updated" : "New password"}
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--muted)]">
          {done
            ? "Your password has been reset. Redirecting to sign in…"
            : "Enter a new password for your account"}
        </p>

        {done ? (
          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-block rounded-full bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-2.5 font-semibold text-white hover:brightness-110"
            >
              Sign in now
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
                placeholder="Repeat password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-violet-600 to-violet-500 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update password"}
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
