"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    router.push(data.redirect ?? "/portal/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0a1628" }}>
      <div
        className="w-full max-w-md rounded-xl border p-8 space-y-6"
        style={{ borderColor: "#1e3a5f", background: "#111b2e" }}
      >
        <div>
          <h1 className="text-2xl font-semibold text-white">Subscriber Portal</h1>
          <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
            Sign in with your line username and password.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span style={{ color: "#94a3b8" }}>Username</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-white"
              style={{ borderColor: "#1e3a5f" }}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "#94a3b8" }}>Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-white"
              style={{ borderColor: "#1e3a5f" }}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          {error && (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded py-2.5 font-medium cursor-pointer disabled:opacity-60"
            style={{ background: "#22d3ee", color: "#0a1628" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-center" style={{ color: "#64748b" }}>
          Need help? Contact your provider or{" "}
          <Link href="/portal/support" className="underline" style={{ color: "#22d3ee" }}>
            open a support ticket
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
