"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const trial = searchParams.get("trial") === "1";
  const next = searchParams.get("next");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      email: String(form.get("email")),
      password: String(form.get("password")),
      name: form.get("name") ? String(form.get("name")) : undefined,
      startTrial: trial || undefined,
    };

    if (mode === "register") {
      const utmSource = searchParams.get("utm_source");
      const utmMedium = searchParams.get("utm_medium");
      const utmCampaign = searchParams.get("utm_campaign");
      if (utmSource) payload.utmSource = utmSource;
      if (utmMedium) payload.utmMedium = utmMedium;
      if (utmCampaign) payload.utmCampaign = utmCampaign;
    }

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    const dest =
      data.user?.role === "ADMIN"
        ? next && next.startsWith("/")
          ? next
          : "/admin"
        : next && next.startsWith("/")
          ? next
          : trial && mode === "login"
            ? "/pricing?trial=1"
          : data.trial || trial
            ? "/dashboard"
            : plan && mode === "register"
              ? `/pricing?checkout=${plan}`
              : "/dashboard";

    router.push(dest);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      {trial && mode === "register" && (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          Your free <strong>7-day license key</strong> is created automatically when you sign up.
        </p>
      )}
      {mode === "register" && (
        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            name="name"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
            placeholder="Your name"
          />
        </div>
      )}
      <div>
        <label className="block text-sm text-slate-400 mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-gradient-to-r from-violet-600 to-violet-500 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {loading
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : trial
              ? "Create account & get trial license"
              : "Create account"}
      </button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            <Link href="/forgot-password" className="text-violet-400 hover:underline block mb-2">
              Forgot password?
            </Link>
            No account?{" "}
            <Link href="/register?trial=1" className="text-violet-400 hover:underline">
              Start free trial
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href={trial ? "/login?trial=1" : "/login"}
              className="text-violet-400 hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
