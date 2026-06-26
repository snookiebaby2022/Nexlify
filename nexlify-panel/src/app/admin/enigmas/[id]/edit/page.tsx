"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function AdminEnigmaEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [form, setForm] = useState({ mac: "", lineId: "", model: "", isActive: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/lines").then((r) => r.json()),
      fetch("/api/admin/enigma").then((r) => r.json()),
    ]).then(([linesData, enigmaData]) => {
      setLines(linesData.lines ?? []);
      const d = (enigmaData.devices ?? []).find((x: { id: string }) => x.id === id);
      if (d) {
        setForm({
          mac: d.mac,
          lineId: d.line.id,
          model: d.model ?? "",
          isActive: d.isActive,
        });
      }
      setLoading(false);
    });
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/enigma", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...form }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push("/admin/enigmas");
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <Link href="/admin/enigmas" className="text-sm" style={{ color: "var(--accent)" }}>
        ← Enigma devices
      </Link>
      <h1 className="text-2xl font-semibold">Edit Enigma device</h1>
      <form
        onSubmit={save}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <input
          placeholder="MAC (AA:BB:CC:DD:EE:FF)"
          className="w-full rounded border px-3 py-2 bg-transparent font-mono"
          style={{ borderColor: "var(--border)" }}
          value={form.mac}
          onChange={(e) => setForm({ ...form, mac: e.target.value })}
          required
        />
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
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
        <input
          placeholder="Model"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded py-3 font-semibold cursor-pointer disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving…" : "Save device"}
        </button>
      </form>
    </div>
  );
}
