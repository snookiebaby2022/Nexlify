"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResellerEnigmaAddPage() {
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [form, setForm] = useState({ mac: "", lineId: "", model: "" });

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/enigma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    window.location.href = "/reseller/enigmas";
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">Add Enigma device</h1>
        <Link href="/reseller/enigmas" className="text-sm link-back">
          ← Manage Enigma devices
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Link an Enigma2 box MAC to a line (uses the same portal stack as MAG).
      </p>
      <form
        onSubmit={add}
        className="rounded-lg border p-5 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <input
          placeholder="MAC (AA:BB:CC:DD:EE:FF) *"
          required
          className="w-full rounded border px-3 py-2 bg-transparent font-mono"
          style={{ borderColor: "var(--border)" }}
          value={form.mac}
          onChange={(e) => setForm({ ...form, mac: e.target.value })}
        />
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.lineId}
          onChange={(e) => setForm({ ...form, lineId: e.target.value })}
          required
        >
          <option value="">Select line *</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.username}
            </option>
          ))}
        </select>
        <input
          placeholder="Model (optional)"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <button
          type="submit"
          className="rounded py-2.5 px-5 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add Enigma device
        </button>
      </form>
    </div>
  );
}
