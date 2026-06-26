"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { ADDON_LICENSE_SERVICES } from "@/lib/addon-license-services";

function AddonLicenseAddForm() {
  const sp = useSearchParams();
  const prefill = sp.get("service") ?? "spotify";
  const [form, setForm] = useState({
    service: prefill,
    label: "",
    licenseKey: "",
    expiresAt: "",
    notes: "",
  });
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/addon-licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: form.service,
        label: form.label || ADDON_LICENSE_SERVICES.find((s) => s.id === form.service)?.label,
        licenseKey: form.licenseKey || null,
        expiresAt: form.expiresAt || null,
        notes: form.notes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    window.location.href = "/admin/license/addon";
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>Service</span>
        <select
          className="panel-select mt-1 w-full rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={form.service}
          onChange={(e) => setForm({ ...form, service: e.target.value })}
        >
          {ADDON_LICENSE_SERVICES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>Label</span>
        <input
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Production API key"
        />
      </label>
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>License / API key</span>
        <textarea
          className="mt-1 w-full min-h-[80px] font-mono text-xs rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.licenseKey}
          onChange={(e) => setForm({ ...form, licenseKey: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>Expires (optional)</span>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>Notes</span>
        <input
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      <button type="submit" className="btn-positive rounded px-4 py-2 text-sm cursor-pointer">
        Save addon license
      </button>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <Link href="/admin/license/addon" className="text-sm link-back inline-block">
        ← Addon licenses
      </Link>
    </form>
  );
}

export default function AddonLicenseAddPage() {
  return (
    <FormPageShell title="Add Addon License" manageHref="/admin/license/addon" manageLabel="Show All">
      <Suspense>
        <AddonLicenseAddForm />
      </Suspense>
    </FormPageShell>
  );
}
