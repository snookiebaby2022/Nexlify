"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagModelSelect } from "@/components/mag-model-select";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";

export default function ResellerMagAddPage() {
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [form, setForm] = useState({ mac: "", lineId: "", model: "" });

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/mag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    window.location.href = "/reseller/mags";
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">Add MAG device</h1>
        <Link href="/reseller/mags" className="text-sm link-back">
          ← Manage MAG devices
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Link a MAG set-top box MAC address to one of your subscription lines.
      </p>
      <form
        onSubmit={add}
        className="rounded-lg border p-5 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <FormField label="MAC address">
          <input
            required
            className={`${formInputClass} font-mono`}
            style={formInputStyle}
            value={form.mac}
            onChange={(e) => setForm({ ...form, mac: e.target.value })}
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
            <option value="">Select line</option>
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
        <button
          type="submit"
          className="rounded py-2.5 px-5 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add MAG device
        </button>
      </form>
    </div>
  );
}
