"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminProfilePage() {
  const [user, setUser] = useState<{ name: string | null; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setSaving(true);
    const payload: any = {};
    if (name && name !== user?.name) payload.name = name;
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    if (Object.keys(payload).length === 0) {
      setError("Nothing to update");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }

    setMessage("Profile updated successfully");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    if (data.user) setUser(data.user);
  }

  if (loading) {
    return (
      <div className="mesh-bg mx-auto max-w-2xl px-4 py-16">
        <div className="text-center text-[var(--muted)]">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mesh-bg mx-auto max-w-2xl px-4 py-16">
        <div className="text-center text-[var(--muted)]">Please sign in.</div>
      </div>
    );
  }

  return (
    <div className="mesh-bg mx-auto max-w-2xl px-4 py-16 md:py-24">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Profile</h1>
        <p className="mt-2 text-[var(--muted)]">Manage your account and password.</p>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-[#12101f] p-6">
        <div className="mb-4">
          <div className="text-sm text-[var(--muted)]">Email</div>
          <div className="text-white font-medium">{user.email}</div>
        </div>
        <div>
          <div className="text-sm text-[var(--muted)]">Role</div>
          <div className="text-white font-medium capitalize">{user.role.toLowerCase()}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#12101f] p-6 space-y-5">
        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-400 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            placeholder="Your name"
          />
        </div>

        <div className="border-t border-white/10 pt-5">
          <h3 className="text-white font-semibold mb-1">Change password</h3>
          <p className="text-sm text-[var(--muted)] mb-4">Leave blank to keep your current password.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                placeholder="••••••"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                placeholder="Repeat new password"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Link href="/admin" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
            ← Back to Admin
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-violet-600 px-6 py-2.5 font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
