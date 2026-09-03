"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FormPageShell, FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { PasswordInput } from "@/components/password-input";
import { CopyableCredential } from "@/components/copyable-credential";
import { clampLineCredentialMinLength, DEFAULT_LINE_CREDENTIAL_MIN_LENGTH } from "@/lib/credential-generate";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
];

export default function AdminEditUserPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [parents, setParents] = useState<{ id: string; username: string; role: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [credentialMinLength, setCredentialMinLength] = useState(DEFAULT_LINE_CREDENTIAL_MIN_LENGTH);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    currentPassword: "",
    email: "",
    isActive: true,
    defaultLanguage: "en",
    groupId: "",
    parentId: "",
    resellerDns: "",
    credits: 0,
    maxLines: 500,
    notes: "",
    role: "RESELLER" as "ADMIN" | "RESELLER" | "SUB_RESELLER",
    profitPercent: 0,
  });

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => setGroups((d.groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))));
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) =>
        setParents(
          (d.users ?? d.resellers ?? [])
            .filter((u: { id: string; role?: string }) => {
              if (u.id === id) return false;
              return u.role === "ADMIN" || u.role === "RESELLER" || u.role === "SUB_RESELLER";
            })
            .map((u: { id: string; username: string; role?: string }) => ({
              id: u.id,
              username: u.username,
              role: u.role ?? "RESELLER",
            }))
        )
      );
    fetch("/api/panel/line-ux")
      .then((r) => r.json())
      .then((d) => {
        if (d?.credentialMinLength != null) {
          setCredentialMinLength(clampLineCredentialMinLength(d.credentialMinLength));
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/resellers?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "User not found");
        const u = d.user;
        setForm({
          username: u.username ?? "",
          password: "",
          confirmPassword: "",
          currentPassword: u.password ?? "",
          email: u.email ?? "",
          isActive: Boolean(u.isActive),
          defaultLanguage: u.defaultLanguage || "en",
          groupId: u.groupId ?? "",
          parentId: u.parentId ?? "",
          resellerDns: u.resellerDns ?? "",
          credits: Number(u.credits ?? 0),
          maxLines: Number(u.maxLines ?? 500),
          notes: u.notes ?? "",
          role: (u.role as "ADMIN" | "RESELLER" | "SUB_RESELLER") || "RESELLER",
          profitPercent: Number(u.profitPercent ?? 0),
        });
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (form.password && form.password !== form.confirmPassword) {
      setMsg("Password and confirm password do not match.");
      return;
    }
    if (form.username.trim().length < credentialMinLength) {
      setMsg(`Username must be at least ${credentialMinLength} characters.`);
      return;
    }
    if (form.password && form.password.length < credentialMinLength) {
      setMsg(`Password must be at least ${credentialMinLength} characters.`);
      return;
    }
    if (form.role === "SUB_RESELLER" && !form.parentId) {
      setMsg("Sub-reseller requires a parent reseller.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/resellers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        username: form.username,
        password: form.password || undefined,
        email: form.email || null,
        isActive: form.isActive,
        defaultLanguage: form.defaultLanguage,
        groupId: form.groupId || null,
        parentId: form.role === "ADMIN" ? null : form.parentId || null,
        resellerDns: form.resellerDns || null,
        credits: form.credits,
        maxLines: form.maxLines,
        notes: form.notes || null,
        role: form.role,
        profitPercent: form.profitPercent,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(j.error ?? "Save failed");
      return;
    }
    router.push("/admin/resellers");
  }

  if (loading) {
    return <p className="text-sm p-6" style={{ color: "var(--muted)" }}>Loading user…</p>;
  }

  return (
    <FormPageShell title="Edit User" manageHref="/admin/resellers" manageLabel="Manage Users">
      <form onSubmit={save} className="space-y-4 max-w-xl">
        {msg ? (
          <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            {msg}
          </p>
        ) : null}

        <FormField label="Username" required>
          <input
            className={formInputClass}
            style={formInputStyle}
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            minLength={credentialMinLength}
          />
        </FormField>

        <FormField label="Email">
          <input
            type="email"
            className={formInputClass}
            style={formInputStyle}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </FormField>

        <FormField label="Current password">
          {form.currentPassword ? (
            <div className="py-1">
              <CopyableCredential value={form.currentPassword} masked />
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Not stored yet — set a new password below to enable reveal in Manage Users.
            </p>
          )}
        </FormField>

        <FormField label="New password">
          <PasswordInput
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            minLength={form.password ? credentialMinLength : undefined}
          />
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Leave blank to keep current password. New passwords must be at least {credentialMinLength} characters.
          </p>
        </FormField>

        <FormField label="Confirm password">
          <PasswordInput
            value={form.confirmPassword}
            onChange={(v) => setForm((f) => ({ ...f, confirmPassword: v }))}
          />
        </FormField>

        <FormField label="Role">
          <select
            className={formSelectClass}
            style={{ ...formInputStyle, background: "#fff", color: "#111" }}
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                role: e.target.value as "ADMIN" | "RESELLER" | "SUB_RESELLER",
              }))
            }
          >
            <option value="ADMIN">Admin</option>
            <option value="RESELLER">Reseller</option>
            <option value="SUB_RESELLER">Sub-reseller</option>
          </select>
        </FormField>

        <FormField label="User group">
          <select
            className={formSelectClass}
            style={{ ...formInputStyle, background: "#fff", color: "#111" }}
            value={form.groupId}
            onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
          >
            <option value="">— default for role —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FormField>

        {form.role === "ADMIN" ? null : (
          <FormField label="Owner" required={form.role === "SUB_RESELLER"}>
            <select
              className={formSelectClass}
              style={{ ...formInputStyle, background: "#fff", color: "#111" }}
              value={form.parentId}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              required={form.role === "SUB_RESELLER"}
            >
              <option value="">{form.role === "SUB_RESELLER" ? "Select owner…" : "— none —"}</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username} ({p.role === "ADMIN" ? "admin" : p.role === "SUB_RESELLER" ? "sub-reseller" : "reseller"})
                </option>
              ))}
            </select>
          </FormField>
        )}

        {form.role === "ADMIN" ? null : (
          <FormField label="Reseller DNS (IPTV + portal)">
            <input
              className={formInputClass}
              style={formInputStyle}
              placeholder="iptv.reseller-domain.com"
              value={form.resellerDns}
              onChange={(e) => setForm((f) => ({ ...f, resellerDns: e.target.value }))}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Point this hostname at the panel IP. Used for playlists and MAG/Stalker portal (
              <span className="font-mono">/c/</span>).
            </p>
          </FormField>
        )}

        <FormField label="Credits">
          <input
            type="number"
            className={formInputClass}
            style={formInputStyle}
            value={form.credits}
            onChange={(e) => setForm((f) => ({ ...f, credits: Number(e.target.value) || 0 }))}
          />
        </FormField>

        <FormField label="Profit % (NXT markup)">
          <input
            type="number"
            min={0}
            step={0.5}
            className={formInputClass}
            style={formInputStyle}
            value={form.profitPercent}
            onChange={(e) => setForm((f) => ({ ...f, profitPercent: Number(e.target.value) || 0 }))}
          />
        </FormField>

        <FormField label="Max lines">
          <input
            type="number"
            className={formInputClass}
            style={formInputStyle}
            value={form.maxLines}
            onChange={(e) => setForm((f) => ({ ...f, maxLines: Number(e.target.value) || 0 }))}
          />
        </FormField>

        <FormField label="Language">
          <select
            className={formSelectClass}
            style={{ ...formInputStyle, background: "#fff", color: "#111" }}
            value={form.defaultLanguage}
            onChange={(e) => setForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Notes">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Active
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href="/admin/resellers" className="btn-cancel rounded px-6 py-2.5 text-sm font-medium inline-flex items-center">
            Cancel
          </Link>
        </div>
      </form>
    </FormPageShell>
  );
}
