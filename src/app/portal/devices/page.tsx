"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PortalDevicesPage() {
  const [devices, setDevices] = useState<{
    bindings: { id: string; deviceId: string; status: string }[];
    magDevices: { id: string; mac: string; isActive: boolean }[];
    enigmaDevices: { id: string; mac: string; isActive: boolean }[];
  } | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", msg: "" });

  useEffect(() => {
    fetch("/api/portal/devices")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDevices(d));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordForm((f) => ({ ...f, msg: "" }));
    const res = await fetch("/api/portal/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next,
      }),
    });
    const data = await res.json();
    setPasswordForm((f) => ({
      ...f,
      msg: res.ok ? "Password updated." : data.error ?? "Failed",
      current: "",
      next: "",
    }));
  }

  return (
    <div className="min-h-screen text-white p-6" style={{ background: "#0a1628" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/portal/dashboard" className="text-sm" style={{ color: "#22d3ee" }}>
          ← Back to subscription
        </Link>
        <h1 className="text-xl font-semibold">Account & devices</h1>

        <section className="rounded-xl border p-5 space-y-3" style={{ borderColor: "#1e3a5f" }}>
          <h2 className="font-medium">Change password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <input
              type="password"
              placeholder="Current password"
              className="w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "#1e3a5f" }}
              value={passwordForm.current}
              onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
            />
            <input
              type="password"
              placeholder="New password"
              className="w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "#1e3a5f" }}
              value={passwordForm.next}
              onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
            />
            <button type="submit" className="rounded px-4 py-2 text-sm" style={{ background: "#22d3ee", color: "#0a1628" }}>
              Update password
            </button>
            {passwordForm.msg && <p className="text-xs" style={{ color: "#94a3b8" }}>{passwordForm.msg}</p>}
          </form>
        </section>

        {devices && (
          <>
            <section className="rounded-xl border p-5" style={{ borderColor: "#1e3a5f" }}>
              <h2 className="font-medium mb-2">Device bindings</h2>
              {devices.bindings.length === 0 ? (
                <p className="text-sm" style={{ color: "#64748b" }}>No bound devices.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {devices.bindings.map((b) => (
                    <li key={b.id}>{b.deviceId} — {b.status}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border p-5" style={{ borderColor: "#1e3a5f" }}>
              <h2 className="font-medium mb-2">MAG / Enigma</h2>
              <p className="text-sm" style={{ color: "#94a3b8" }}>
                MAG: {devices.magDevices.map((m) => m.mac).join(", ") || "—"}
              </p>
              <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
                Enigma: {devices.enigmaDevices.map((m) => m.mac).join(", ") || "—"}
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
