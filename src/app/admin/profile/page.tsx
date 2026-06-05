"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarStudio } from "@/components/avatar-studio";
import { AvatarRenderer } from "@/components/avatar-renderer";
import { AnimatedAvatarFrame, animatedAvatarSize } from "@/components/animated-avatar-frame";
import { ExternalImage } from "@/components/external-image";
import { UserAvatar } from "@/components/user-avatar";
import type { AvatarConfig } from "@/lib/avatar-config";
import { DEFAULT_AVATAR_CONFIG, parseAvatarConfig } from "@/lib/avatar-config";

type DisplayMode = "character" | "photo";

export default function AdminProfilePage() {
  const [user, setUser] = useState<{
    username: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
    avatarConfig: unknown;
    role: string;
    credits: number;
  } | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "" });
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("character");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [panelUrl, setPanelUrl] = useState<{
    canonicalUrl: string | null;
    primaryDomain: string | null;
    aliases: string[];
    panelPort?: number;
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
        setAvatarUrl(d.user.avatarUrl ?? "");
        const parsed = parseAvatarConfig(d.user.avatarConfig);
        if (parsed) setAvatarConfig(parsed);
        setDisplayMode(d.user.avatarUrl ? "photo" : "character");
        setTotpEnabled(Boolean(d.user.totpEnabled));
      });
  }

  async function startTotpSetup() {
    const res = await fetch("/api/admin/profile/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const data = await res.json();
    if (res.ok) setTotpSetup({ secret: data.secret, uri: data.uri });
    else setMsg(data.error ?? "Setup failed");
  }

  async function enableTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!totpSetup) return;
    const res = await fetch("/api/admin/profile/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable", secret: totpSetup.secret, code: totpCode }),
    });
    const data = await res.json();
    if (res.ok) {
      setTotpEnabled(true);
      setTotpSetup(null);
      setTotpCode("");
      setMsg("Two-factor authentication enabled");
    } else setMsg(data.error ?? "Invalid code");
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/profile/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", code: totpCode }),
    });
    const data = await res.json();
    if (res.ok) {
      setTotpEnabled(false);
      setTotpCode("");
      setMsg("Two-factor authentication disabled");
    } else setMsg(data.error ?? "Invalid code");
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
          panelPort: d.panelPort,
        })
      );
  }, []);

  async function saveProfile(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setMsg("");
    const body: Record<string, unknown> = { ...form };
    if (displayMode === "photo") {
      body.avatarUrl = avatarUrl.trim() || null;
      body.avatarConfig = null;
    } else {
      body.avatarConfig = avatarConfig;
      body.avatarUrl = null;
    }
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const previewPhoto = displayMode === "photo" && avatarUrl.trim();

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-semibold">My profile</h1>

      <div
        className="flex items-center gap-5 rounded-lg border p-5"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="shrink-0">
          {previewPhoto ? (
            <ExternalImage
              src={avatarUrl}
              alt="Display picture"
              width={96}
              height={96}
              className="w-24 h-24 rounded-full object-cover border-2"
              style={{ borderColor: "var(--accent)" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <AnimatedAvatarFrame backgroundColor={avatarConfig.backgroundColor} size="sm">
              <AvatarRenderer
                config={avatarConfig}
                size={animatedAvatarSize("sm")}
                showBackground={false}
              />
            </AnimatedAvatarFrame>
          )}
        </div>
        <div>
          <div className="font-medium text-lg">{user?.displayName || user?.username}</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            @{user?.username} · {user?.role}
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            This picture appears in the top navigation and across the panel. Use{" "}
            <strong>Customize</strong> below for hair, clothes, colors, and accessories.
          </p>
        </div>
      </div>

      <div
        className="rounded-lg border p-4 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Panel domains</span>
          <Link href="/admin/settings/domains" className="text-xs" style={{ color: "var(--accent)" }}>
            Configure →
          </Link>
        </div>
        {panelUrl?.primaryDomain ? (
          <>
            {panelUrl.canonicalUrl && (
              <a
                href={panelUrl.canonicalUrl}
                className="font-mono text-xs break-all block"
                style={{ color: "var(--accent)" }}
              >
                {panelUrl.canonicalUrl}
              </a>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No primary domain set.
          </p>
        )}
      </div>

      <form
        onSubmit={saveProfile}
        className="rounded-lg border p-6 space-y-6"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">Display picture</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm cursor-pointer border"
            style={{
              borderColor: displayMode === "character" ? "var(--accent)" : "var(--border)",
              background: displayMode === "character" ? "rgba(94,184,232,0.12)" : "transparent",
            }}
            onClick={() => setDisplayMode("character")}
          >
            Character avatar
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm cursor-pointer border"
            style={{
              borderColor: displayMode === "photo" ? "var(--accent)" : "var(--border)",
              background: displayMode === "photo" ? "rgba(94,184,232,0.12)" : "transparent",
            }}
            onClick={() => setDisplayMode("photo")}
          >
            Photo URL
          </button>
        </div>

        {displayMode === "character" ? (
          <AvatarStudio
            key={`avatar-${user?.username ?? "new"}`}
            config={avatarConfig}
            onChange={setAvatarConfig}
            username={form.displayName || user?.username}
          />
        ) : (
          <div className="space-y-3">
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Image URL (HTTPS recommended)</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </label>
            {avatarUrl.trim() && (
              <ExternalImage
                src={avatarUrl}
                alt="Preview"
                width={128}
                height={128}
                className="w-32 h-32 rounded-full object-cover border"
                style={{ borderColor: "var(--border)" }}
              />
            )}
          </div>
        )}

        <h2 className="font-medium pt-2">Profile details</h2>
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

      <section
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex items-center gap-4">
          <UserAvatar
            username={user?.username ?? "admin"}
            photoUrl={displayMode === "photo" ? avatarUrl : null}
            avatarConfig={displayMode === "character" ? avatarConfig : null}
            size={48}
          />
          <div>
            <h2 className="font-medium">Nav avatar preview</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Photo URL or Reddit-style initials appear in the top-right header.
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">Two-factor authentication (TOTP)</h2>
        {totpEnabled ? (
          <form onSubmit={disableTotp} className="space-y-3">
            <p className="text-sm" style={{ color: "var(--success)" }}>
              2FA is enabled for your account.
            </p>
            <input
              className="w-full max-w-xs rounded border px-3 py-2 bg-transparent font-mono"
              style={{ borderColor: "var(--border)" }}
              placeholder="Code to disable"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button type="submit" className="rounded px-4 py-2 text-sm border cursor-pointer" style={{ borderColor: "var(--border)" }}>
              Disable 2FA
            </button>
          </form>
        ) : totpSetup ? (
          <form onSubmit={enableTotp} className="space-y-3">
            <p className="text-xs font-mono break-all" style={{ color: "var(--muted)" }}>
              Secret: {totpSetup.secret}
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Add this key to Google Authenticator, then enter the 6-digit code.
            </p>
            <input
              className="w-full max-w-xs rounded border px-3 py-2 bg-transparent font-mono"
              style={{ borderColor: "var(--border)" }}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button type="submit" className="rounded px-4 py-2 text-sm cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>
              Confirm & enable
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={startTotpSetup}
            className="rounded px-4 py-2 text-sm cursor-pointer border"
            style={{ borderColor: "var(--border)" }}
          >
            Set up authenticator app
          </button>
        )}
      </section>

      <form
        onSubmit={savePassword}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">Change password</h2>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>Current password</span>
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span style={{ color: "var(--muted)" }}>New password</span>
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
          />
        </label>
        <button
          type="submit"
          className="rounded px-4 py-2 cursor-pointer border"
          style={{ borderColor: "var(--border)" }}
        >
          Update password
        </button>
      </form>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
