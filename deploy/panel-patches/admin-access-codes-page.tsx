"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type AccessCode = {
  id: string;
  code: string;
  days: number;
  maxConnections: number;
  maxUses: number;
  uses: number;
  isActive: boolean;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
};

export default function AdminAccessCodesPage() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [form, setForm] = useState({
    code: "",
    days: 30,
    maxConnections: 1,
    maxUses: 1,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/access-codes")
      .then((r) => r.json())
      .then((d) => setCodes(d.codes ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/access-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ code: "", days: 30, maxConnections: 1, maxUses: 1, notes: "" });
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this access code?")) return;
    await fetch(`/api/admin/access-codes?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Access codes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Redemption codes for new lines. API: <code>GET /api/v1?action=get_access_codes</code>
        </p>
      </div>

      <form
        onSubmit={create}
        className="rounded-xl border p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          required
          placeholder="CODE"
          className="rounded-lg border px-3 py-2 text-sm uppercase"
          style={{ borderColor: "var(--border)" }}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        />
        <input
          type="number"
          min={1}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={form.days}
          onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
          placeholder="Days"
        />
        <input
          type="number"
          min={1}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={form.maxConnections}
          onChange={(e) => setForm({ ...form, maxConnections: Number(e.target.value) })}
          placeholder="Max connections"
        />
        <input
          type="number"
          min={1}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={form.maxUses}
          onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
          placeholder="Max uses"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
          style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }}
        >
          {saving ? "Creating…" : "Create code"}
        </button>
      </form>

      <DataTable
        headers={["Code", "Days", "Uses", "Max conn.", "Active", "Expires", "Created", ""]}
        rows={codes.map((c) => [
          <code key={c.id}>{c.code}</code>,
          c.days,
          `${c.uses} / ${c.maxUses}`,
          c.maxConnections,
          c.isActive ? "Yes" : "No",
          c.expiresAt ? formatDateTime(c.expiresAt) : "—",
          formatDateTime(c.createdAt),
          <button
            key={`del-${c.id}`}
            type="button"
            onClick={() => remove(c.id)}
            className="text-xs cursor-pointer"
            style={{ color: "var(--danger)" }}
          >
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
