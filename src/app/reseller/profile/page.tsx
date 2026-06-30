"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarStudio } from "@/components/avatar-studio";
import { AvatarRenderer } from "@/components/avatar-renderer";
import { AnimatedAvatarFrame, animatedAvatarSize } from "@/components/animated-avatar-frame";
import type { AvatarConfig } from "@/lib/avatar-config";
import { DEFAULT_AVATAR_CONFIG, parseAvatarConfig } from "@/lib/avatar-config";

export default function ResellerProfilePage() {
  const [user, setUser] = useState<{
    username: string;
    displayName: string | null;
    email: string | null;
    avatarConfig: unknown;
    role: string;
    credits: number;
  } | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "" });
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [panelUrl, setPanelUrl] = useState<{
    canonicalUrl: string | null;
    primaryDomain: string | null;
    aliases: string[];
  } | null>(null);

  function load() {
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setForm({
          displayName: d.user.displayName ?? "",
          email: d.user.email ?? "",
        });
        const parsed = parseAvatarConfig(d.user.avatarConfig);
        if (parsed) setAvatarConfig(parsed);
      });
  }

  useEffect(() => {
    load();
    fetch("/api/panel/url")
      .then((r) => r.json())
      .then((d) =>
        setPanelUrl({
          canonicalUrl: d.canonicalUrl ?? null,
          primaryDomain: d.primaryDomain ?? null,
          aliases: d.aliases ?? [],
        })
      );
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, avatarConfig, avatarUrl: null }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setMsg("Profile saved");
      window.dispatchEvent(new Event("nexlify-profile-updated"));
      load();
    } else {
      setMsg(data.error ?? "Save failed");
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(passwords),
    });
    setMsg(res.ok ? "Password updated" : (await res.json()).error);
    setPasswords({ currentPassword: "", newPassword: "" });
  }

  const initial = (user?.displayName || user?.username || "A").charAt(0).toUpperCase();
  const hasAvatar = parseAvatarConfig(user?.avatarConfig) != null;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Edit profile</h1>
        <Link href="/reseller/modules" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Modules
        </Link>
      </div>
      <div className="flex items-center gap-4">
        {hasAvatar ? (
          <AnimatedAvatarFrame backgroundColor={avatarConfig.backgroundColor} size="sm">
            <AvatarRenderer
              config={avatarConfig}
              size={animatedAvatarSize("sm")}
              showBackground={false}
            />
          </AnimatedAvatarFrame>
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {initial}
          </div>
        )}
        <div>
          <div className="font-medium text-lg">{user?.displayName || user?.username}</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Credits: {user?.credits ?? 0}
          </div>
        </div>
      </div>
      {panelUrl?.primaryDomain && (
        <div
          className="rounded-lg border p-4 text-sm space-y-1"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="font-medium">Panel URL</div>
          <p style={{ color: "var(--muted)" }}>
            Use this address for admin and reseller access. Contact your provider to change domains.
          </p>
          {panelUrl.canonicalUrl && (
            <a href={panelUrl.canonicalUrl} style={{ color: "var(--accent)" }} className="font-mono text-xs break-all">
              {panelUrl.canonicalUrl}
            </a>
          )}
          {panelUrl.aliases.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Also works on: {panelUrl.aliases.join(", ")}
            </p>
          )}
        </div>
      )}
      <form
        onSubmit={saveProfile}
        className="rounded-lg border p-6 space-y-6"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">Avatar</h2>
        <AvatarStudio
          key={`avatar-${user?.username ?? "new"}`}
          config={avatarConfig}
          onChange={setAvatarConfig}
          username={form.displayName || user?.username}
          usernameHint="Your display name appears in the panel header and on your profile."
        />
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>Display name</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full py-3 font-semibold cursor-pointer disabled:opacity-60"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      <form
        onSubmit={savePassword}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">Password</h2>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Current"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={passwords.currentPassword}
          onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={passwords.newPassword}
          onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
        />
        <button type="submit" className="rounded px-4 py-2 cursor-pointer border" style={{ borderColor: "var(--border)" }}>
          Update password
        </button>
      </form>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
