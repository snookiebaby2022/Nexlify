"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormPageShell, FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { PasswordInput } from "@/components/password-input";

export default function ResellerAddUserPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [myCredits, setMyCredits] = useState(0);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    groupId: "",
    credits: 0,
    notes: "",
  });

  useEffect(() => {
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((d) => {
        setMyCredits(d.user?.credits ?? 0);
        const g = d.user?.group;
        if (g?.id && g?.name) {
          setGroups([{ id: g.id, name: g.name }]);
          setForm((f) => ({ ...f, groupId: g.id }));
        }
      })
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (form.password !== form.confirmPassword) {
      setMsg("Password and confirm password do not match.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/reseller/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
        email: form.email,
        groupId: form.groupId || undefined,
        credits: form.credits,
        notes: form.notes,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to create user");
      return;
    }
    router.push("/reseller/users");
  }

  return (
    <FormPageShell
      title="Add sub-user"
      manageHref="/reseller/users"
      manageLabel="Manage users"
    >
      <form onSubmit={create} className="space-y-4 max-w-xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Your balance: <strong>{myCredits}</strong> credits. Allocated credits are deducted from your account.
          Resellers and sub-resellers can each create their own sub-users under this panel.
        </p>
        <FormField label="Username" required>
          <input
            required
            className={formInputClass}
            style={formInputStyle}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </FormField>
        <FormField label="Password" required>
          <PasswordInput
            required
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
          />
        </FormField>
        <FormField label="Confirm password" required>
          <PasswordInput
            required
            value={form.confirmPassword}
            onChange={(confirmPassword) => setForm({ ...form, confirmPassword })}
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email"
            className={formInputClass}
            style={formInputStyle}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </FormField>
        {groups.length > 0 && (
          <FormField label="User group (packages)">
            <select
              className={formSelectClass}
              style={formInputStyle}
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            >
              <option value="">Default group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Initial credits">
          <input
            type="number"
            min={0}
            max={myCredits}
            className={formInputClass}
            style={formInputStyle}
            value={form.credits}
            onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value, 10) || 0 })}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>
        {msg && <p className="text-sm text-red-400">{msg}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded px-4 py-2 font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {saving ? "Creating…" : "Create sub-user"}
          </button>
          <Link href="/reseller/users" className="text-sm py-2" style={{ color: "var(--accent)" }}>
            Cancel
          </Link>
        </div>
      </form>
    </FormPageShell>
  );
}
