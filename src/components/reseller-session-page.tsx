"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type Profile = {
  username: string;
  role: string;
  credits: number;
  createdAt: string;
};

export function ResellerSessionPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/profile")
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((d) => setUser(d.user ?? null))
      .catch(() => setError("Could not load session details."));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold">Session</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Your active panel login on this browser.
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {user && (
        <div
          className="rounded-xl border p-5 space-y-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex justify-between gap-4">
            <span style={{ color: "var(--muted)" }}>Username</span>
            <span className="font-medium">{user.username}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "var(--muted)" }}>Role</span>
            <span className="font-medium">{user.role.replace(/_/g, " ")}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "var(--muted)" }}>Credits</span>
            <span className="font-medium tabular-nums">{user.credits}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "var(--muted)" }}>Account since</span>
            <span>{formatDateTime(user.createdAt)}</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/reseller/profile" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Edit profile →
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm font-medium"
          style={{ color: "var(--danger)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
