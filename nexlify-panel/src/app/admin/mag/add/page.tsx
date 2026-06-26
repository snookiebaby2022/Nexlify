"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MagModelSelect } from "@/components/mag-model-select";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";

function AdminMagAddContent() {
  const searchParams = useSearchParams();
  const presetLineId = searchParams.get("lineId") ?? "";
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [form, setForm] = useState({ mac: "", lineId: presetLineId, model: "" });

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines));
  }, []);

  useEffect(() => {
    if (presetLineId) setForm((f) => ({ ...f, lineId: presetLineId }));
  }, [presetLineId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/mag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ mac: "", lineId: "", model: "" });
    window.location.href = "/admin/mag";
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Add MAG box</h1>
      <form
        onSubmit={add}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <FormField label="MAC address">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={form.mac}
            onChange={(e) => setForm({ ...form, mac: e.target.value })}
            required
          />
        </FormField>
        <FormField label="Line">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={form.lineId}
            onChange={(e) => setForm({ ...form, lineId: e.target.value })}
            required
          >
            <option value="">Select line…</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.username}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Model">
          <MagModelSelect
            className={formSelectClass}
            style={formInputStyle}
            value={form.model}
            onChange={(model) => setForm({ ...form, model })}
          />
        </FormField>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded py-2 px-4 font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Register
          </button>
          <Link href="/admin/mag" className="rounded py-2 px-4 text-sm border" style={{ borderColor: "var(--border)" }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function AdminMagAddPage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <AdminMagAddContent />
    </Suspense>
  );
}
