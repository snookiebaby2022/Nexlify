"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormPageShell, FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { PasswordInput } from "@/components/password-input";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
];

export default function AdminAddUserPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [parents, setParents] = useState<{ id: string; username: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    isActive: true,
    defaultLanguage: "en",
    groupId: "",
    parentId: "",
    resellerDns: "",
    credits: 0,
    notes: "",
    role: "RESELLER" as "RESELLER" | "SUB_RESELLER",
  });

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => setGroups((d.groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))));
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) =>
        setParents(
          (d.resellers ?? [])
            .filter((u: { role?: string }) => u.role !== "SUB_RESELLER")
            .map((u: { id: string; username: string }) => ({ id: u.id, username: u.username }))
        )
      );
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (form.password && form.password !== form.confirmPassword) {
      setMsg("Password and confirm password do not match.");
      return;
    }
    if (!form.groupId) {
      setMsg("Please select a user group.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/resellers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username,
        password: form.password || undefined,
        email: form.email || null,
        isActive: form.isActive,
        defaultLanguage: form.defaultLanguage,
        groupId: form.groupId,
        parentId: form.parentId || null,
        resellerDns: form.resellerDns || null,
        credits: form.credits,
        notes: form.notes || null,
        role: form.role,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to create user");
      return;
    }
    if (data.password) {
      setMsg(`User created. Password: ${data.password}`);
      setTimeout(() => router.push("/admin/resellers"), 2000);
    } else {
      router.push("/admin/resellers");
    }
  }

  const showResellerFields = form.role === "RESELLER";

  return (
    <FormPageShell title="Add User" manageHref="/admin/resellers" manageLabel="Manage Users">
      <form onSubmit={create} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <FormField label="Username" required>
            <input
              className={formInputClass}
              style={formInputStyle}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="test456654"
              required
            />
          </FormField>
          <FormField label="Password" required>
            <PasswordInput
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              placeholder="Password"
            />
          </FormField>

          <FormField label="Email">
            <input
              type="email"
              className={formInputClass}
              style={formInputStyle}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
            />
          </FormField>
          <FormField label="Confirm Password" required>
            <PasswordInput
              value={form.confirmPassword}
              onChange={(confirmPassword) => setForm({ ...form, confirmPassword })}
              placeholder="Confirm Password"
            />
          </FormField>

          <FormField label="Is Enabled">
            <select
              className={formSelectClass}
              style={{ ...formInputStyle, background: "#fff", color: "#111" }}
              value={form.isActive ? "true" : "false"}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </FormField>
          <FormField label="Default Language">
            <select
              className={formSelectClass}
              style={{ ...formInputStyle, background: "#fff", color: "#111" }}
              value={form.defaultLanguage}
              onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="User Group" required>
            <select
              className={formSelectClass}
              style={{ ...formInputStyle, background: "#fff", color: "#111" }}
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              required
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Make this User SubReseller to">
            <select
              className={formSelectClass}
              style={{ ...formInputStyle, background: "#fff", color: "#111" }}
              value={form.parentId}
              onChange={(e) => {
                const parentId = e.target.value;
                setForm({
                  ...form,
                  parentId,
                  role: parentId ? "SUB_RESELLER" : "RESELLER",
                });
              }}
            >
              <option value="">Select user</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
                </option>
              ))}
            </select>
          </FormField>

          {showResellerFields && (
            <>
              <FormField label="Reseller DNS (Reseller only, not used)">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.resellerDns}
                  onChange={(e) => setForm({ ...form, resellerDns: e.target.value })}
                />
              </FormField>
              <FormField label="Credits (Reseller only)">
                <input
                  type="number"
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value, 10) || 0 })}
                />
              </FormField>
            </>
          )}
        </div>

        <FormField label="Notes" className="md:col-span-2">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>

        {msg && (
          <p className="text-sm" style={{ color: msg.includes("created") ? "var(--success)" : "var(--danger)" }}>
            {msg}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add user"}
          </button>
          <Link href="/admin/resellers" className="btn-cancel rounded px-6 py-2.5 text-sm font-medium inline-flex items-center">
            Cancel
          </Link>
        </div>
      </form>
    </FormPageShell>
  );
}
